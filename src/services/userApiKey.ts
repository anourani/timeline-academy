import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_MODEL_BY_PROVIDER,
  getModelById,
  resolveModelId,
  type ModelDef,
} from '@/constants/models'
import type { ByokCredential, ByokProvider } from '@/types/ai'

// Storage slots, one per provider plus the user's chosen model.
//
// The Anthropic slot name predates multi-provider support and MUST NOT change.
// Renaming it is silent data loss for every existing BYOK user: no error, no
// migration, they simply drop to the trial tier with their key still sitting
// in localStorage under the old name.
const KEY_ANTHROPIC = 'timeline_byok_anthropic_key'
const KEY_OPENAI = 'timeline_byok_openai_key'
const KEY_MODEL = 'timeline_byok_model'

// The slot the removed default-provider picker wrote. Read-only now, and kept
// for exactly one purpose: seeding KEY_MODEL for users who chose OpenAI
// before the model selector shipped (see getPreferredModel). Never written
// again.
const KEY_PREFERRED = 'timeline_byok_provider'

const SLOT: Record<ByokProvider, string> = {
  anthropic: KEY_ANTHROPIC,
  openai: KEY_OPENAI,
}

const WATCHED = new Set([KEY_ANTHROPIC, KEY_OPENAI, KEY_MODEL, KEY_PREFERRED])

// Brings the server-side byok_enabled flag in sync with whether ANY BYOK key
// exists in localStorage. The flag lives in app_metadata (which the client
// cannot write directly — plan limits are derived from it server-side), so
// the sync goes through the set-byok-flag edge function. Idempotent and
// best-effort: no-op when already in sync, no-op when logged out, errors are
// logged not thrown.
//
// The flag stays a plain boolean: limits do not vary by provider, so recording
// which provider a user brought would mean an app_metadata migration and an
// SQL change for no behavioural gain.
async function reconcileBYOKMetadata(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const hasKey = hasAnyKey()
    const currentFlag = !!user.app_metadata?.byok_enabled
    if (hasKey === currentFlag) return
    await supabase.functions.invoke('set-byok-flag', {
      body: { enabled: hasKey },
    })
  } catch (err) {
    console.warn('BYOK metadata sync failed:', err)
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') void reconcileBYOKMetadata()
})

function readSlot(name: string): string | null {
  try {
    const v = localStorage.getItem(name)
    return v && v.trim() ? v : null
  } catch {
    return null
  }
}

// Notify listeners in this tab — `storage` events only fire in OTHER tabs.
// The event name is an unchecked string literal that lib/limits.ts also
// subscribes to; renaming it here silently freezes plan limits at their
// startup value.
function notifyChanged(): void {
  window.dispatchEvent(new Event('byok:changed'))
}

// ---------------------------------------------------------------------------
// Per-provider access
// ---------------------------------------------------------------------------

export function getKey(provider: ByokProvider): string | null {
  return readSlot(SLOT[provider])
}

export function setKey(provider: ByokProvider, key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    clearKey(provider)
    return
  }
  try {
    localStorage.setItem(SLOT[provider], trimmed)
    notifyChanged()
  } catch {
    // ignore — quota or disabled storage
  }
  // Must run after the write: reconcile reads storage to decide the flag.
  void reconcileBYOKMetadata()
}

export function clearKey(provider: ByokProvider): void {
  try {
    localStorage.removeItem(SLOT[provider])
    notifyChanged()
  } catch {
    // ignore
  }
  void reconcileBYOKMetadata()
}

export function hasAnyKey(): boolean {
  return Boolean(readSlot(KEY_ANTHROPIC) || readSlot(KEY_OPENAI))
}

/** Internal: the one caller is getActiveModel()'s retry override. Call sites
 *  ask getActiveModel() instead, so the model and the key it bills always
 *  resolve together. */
function getCredentialFor(provider: ByokProvider): ByokCredential | null {
  const key = getKey(provider)
  return key ? { provider, key } : null
}

// ---------------------------------------------------------------------------
// Preferred model
// ---------------------------------------------------------------------------

/** Read-only survivor of the removed default-provider picker. Its only
 *  remaining caller is the seeding branch in getPreferredModel(). */
function getPreferredProvider(): ByokProvider | null {
  const v = readSlot(KEY_PREFERRED)
  return v === 'anthropic' || v === 'openai' ? v : null
}

/**
 * The model the user last chose, or null.
 *
 * Seeding: when KEY_MODEL is empty and the old provider slot says `openai`,
 * the first read writes OpenAI's default into KEY_MODEL. Without it, a user
 * who picked OpenAI before this shipped would find the dropdown showing
 * Sonnet and their next generation running on Anthropic — a silent change of
 * both model and billed account. The Anthropic case needs no seed: it is
 * already the fallback.
 *
 * The seed write deliberately does not call notifyChanged(). This function
 * runs inside the hooks' render-path snapshot, and dispatching an event from
 * there would re-enter React mid-render; the value returned is already the
 * seeded one, so there is nothing a listener could learn from the event.
 */
export function getPreferredModel(): string | null {
  const stored = readSlot(KEY_MODEL)
  if (getModelById(stored)) return stored

  if (!stored && getPreferredProvider() === 'openai') {
    const seeded = DEFAULT_MODEL_BY_PROVIDER.openai
    try {
      localStorage.setItem(KEY_MODEL, seeded)
    } catch {
      // ignore — quota or disabled storage; the fallback still resolves
    }
    return seeded
  }

  return null
}

export function setPreferredModel(id: string): void {
  // Refuse an id the registry does not know: a stale value would resolve to
  // the provider default on every read, which looks like the choice silently
  // not sticking.
  if (!getModelById(id)) return
  try {
    localStorage.setItem(KEY_MODEL, id)
    notifyChanged()
  } catch {
    // ignore
  }
  // Deliberately no reconcile call: a model preference cannot change whether
  // a key exists, so byok_enabled cannot have moved. Skipping it saves a
  // getUser() round-trip on every change.
}

// ---------------------------------------------------------------------------
// Resolution — which model and credential a request should actually use
// ---------------------------------------------------------------------------

/** A model paired with the key that pays for it. */
export interface ActiveModel {
  model: ModelDef
  credential: ByokCredential
}

/**
 * The single resolution rule, as a pure function so the hooks and the
 * imperative getter cannot drift apart.
 *
 * Model and credential resolve together, which is the point: the provider is
 * derived from the chosen model rather than tracked beside it, so the tier
 * logic and the routing logic have nothing to disagree about. The
 * "exactly one key wins" rule that used to live here now lives in
 * resolveModelId(), which applies it to the model id instead.
 */
function resolveActive(
  anthropic: string | null,
  openai: string | null,
  preferredModel: string | null,
): ActiveModel | null {
  if (!anthropic && !openai) return null

  const id = resolveModelId(preferredModel, {
    anthropic: Boolean(anthropic),
    openai: Boolean(openai),
  })
  const model = getModelById(id)
  if (!model) return null

  const key = model.provider === 'openai' ? openai : anthropic
  // resolveModelId only ever returns a model whose provider has a key, so
  // this cannot be null — but the store is external state, so it is checked
  // rather than asserted.
  if (!key) return null

  return { model, credential: { provider: model.provider, key } }
}

/**
 * What a BYOK call should run on right now: the resolved model plus the key
 * for its provider, or null when there is no key (the server path).
 *
 * `override` exists for the retry-with-the-other-provider action. It targets
 * that provider's default model for a single call and does not touch the
 * stored preference, so a one-off retry never silently redefines what the
 * user is on — the same contract the provider override has always had.
 */
export function getActiveModel(override?: ByokProvider): ActiveModel | null {
  if (override) {
    const credential = getCredentialFor(override)
    if (!credential) return null
    const model = getModelById(DEFAULT_MODEL_BY_PROVIDER[override])
    return model ? { model, credential } : null
  }

  return resolveActive(
    readSlot(KEY_ANTHROPIC),
    readSlot(KEY_OPENAI),
    getPreferredModel(),
  )
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Returns an error message, or null when the key looks plausible.
 *
 * Deliberately loose — we check the provider prefix and nothing else, so a
 * new key format from either provider still saves. OpenAI currently issues
 * `sk-`, `sk-proj-`, `sk-svcacct-` and `sk-admin-` prefixes, all covered by
 * the bare `sk-` check.
 *
 * Pasting a key into the wrong field is the likeliest mistake in a two-field
 * form, so that case gets a message naming the mix-up rather than a generic
 * format complaint.
 */
export function validateKeyFormat(
  provider: ByokProvider,
  key: string,
): string | null {
  const trimmed = key.trim()
  if (!trimmed) return 'Paste a key first.'

  if (provider === 'anthropic') {
    if (trimmed.startsWith('sk-ant-')) return null
    if (trimmed.startsWith('sk-')) {
      return 'That looks like an OpenAI key — paste it in the OpenAI field.'
    }
    return 'Anthropic keys start with sk-ant-. Double-check and try again.'
  }

  if (trimmed.startsWith('sk-ant-')) {
    return 'That looks like an Anthropic key — paste it in the Anthropic field.'
  }
  if (trimmed.startsWith('sk-')) return null
  return 'OpenAI keys start with sk-. Double-check and try again.'
}

export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 12) return `${key.slice(0, 4)}…`
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

function subscribe(sync: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    // e.key is null when another tab calls localStorage.clear().
    if (e.key === null || WATCHED.has(e.key)) sync()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener('byok:changed', sync)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('byok:changed', sync)
  }
}

interface ByokKeyState {
  anthropic: string | null
  openai: string | null
  /** The stored model preference, or null when the user has never chosen one
   *  (or chose one this build no longer offers). Not the model that will
   *  run — that is useActiveModel(), which applies the key-availability
   *  fallback on top. */
  model: string | null
}

function snapshot(): ByokKeyState {
  return {
    anthropic: readSlot(KEY_ANTHROPIC),
    openai: readSlot(KEY_OPENAI),
    model: getPreferredModel(),
  }
}

/** Both keys plus the stored model preference. Re-renders on change in any tab. */
export function useByokKeys(): ByokKeyState {
  const [state, setState] = useState<ByokKeyState>(snapshot)

  useEffect(
    () =>
      subscribe(() =>
        setState((prev) => {
          const next = snapshot()
          // Return the previous object when nothing moved so React can bail
          // out of the re-render — `byok:changed` fires on every write,
          // including ones this consumer does not care about.
          return prev.anthropic === next.anthropic &&
            prev.openai === next.openai &&
            prev.model === next.model
            ? prev
            : next
        }),
      ),
    [],
  )

  return state
}

/** The model and credential a request would actually use right now, or null
 *  on the server path. */
export function useActiveModel(): ActiveModel | null {
  const { anthropic, openai, model } = useByokKeys()
  return useMemo(
    () => resolveActive(anthropic, openai, model),
    [anthropic, openai, model],
  )
}

/** The credential a request would actually use right now, or null.
 *
 *  Derived from the resolved model rather than tracked separately, so a
 *  surface that names the provider ("Using your Anthropic key") cannot
 *  disagree with the model that will actually answer. */
export function useByokCredential(): ByokCredential | null {
  return useActiveModel()?.credential ?? null
}

/** Whether any BYOK key exists — the second axis of useAccountTier. */
export function useHasByokKey(): boolean {
  const [has, setHas] = useState<boolean>(hasAnyKey)
  useEffect(() => subscribe(() => setHas(hasAnyKey())), [])
  return has
}
