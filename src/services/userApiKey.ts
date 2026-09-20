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

// Iteration order for "do this for both providers". Derived from SLOT rather
// than written out again, so a third provider cannot be added to the slot map
// and quietly skipped by the sync. Not PROVIDER_ORDER from byokProviders.ts —
// that one is a display decision and is free to change.
const PROVIDER_SLOTS = Object.keys(SLOT) as ByokProvider[]

const WATCHED = new Set([KEY_ANTHROPIC, KEY_OPENAI, KEY_MODEL, KEY_PREFERRED])

function readSlot(name: string): string | null {
  try {
    const v = localStorage.getItem(name)
    return v && v.trim() ? v : null
  } catch {
    return null
  }
}

// Both swallow their errors: storage can be full or disabled entirely, and
// neither is worth failing a key save over — the in-memory value the caller
// just used still works for this page load.
function writeSlot(name: string, value: string): void {
  try {
    localStorage.setItem(name, value)
  } catch {
    // ignore — quota or disabled storage
  }
}

function removeSlot(name: string): void {
  try {
    localStorage.removeItem(name)
  } catch {
    // ignore
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
// Where a key actually lives
// ---------------------------------------------------------------------------
//
// localStorage is the *cache*, not the store. For a signed-in user the store
// is the account: the `byok-keys` Edge Function holds the key as ciphertext
// and hands it back on every device they sign in on. Everything downstream —
// getActiveModel(), the hooks, lib/limits.ts — keeps reading localStorage
// synchronously and is untouched by that, which is the point of the split.
//
// Signed-out users (trial / byok-anon) are unchanged: browser only, nothing
// sent anywhere.
//
// This replaces reconcileBYOKMetadata(), which reported byok_enabled up from
// whatever localStorage happened to hold. On a second browser that was
// `false`, so signing in silently demoted the account from BYOK limits (1200
// events / 25 timelines) to Free (300 / 10) until the first browser re-saved
// the key. The flag is now derived server-side from whether key rows exist,
// so there is no longer a client claim that can be wrong.

type ByokRequest =
  | { action: 'get' }
  | { action: 'set'; provider: ByokProvider; key: string }
  | { action: 'delete'; provider: ByokProvider }
  | { action: 'set-model'; model: string | null }

interface ByokGetResponse {
  keys?: Partial<Record<ByokProvider, string | null>>
  model?: string | null
}

/** The function's own `{ error }` body, which carries the message worth
 *  showing. supabase-js only surfaces the status text on a non-2xx. */
async function readErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return null
  try {
    const body = await context.clone().json()
    return typeof body?.error === 'string' ? body.error : null
  } catch {
    return null
  }
}

async function callByokKeys(body: ByokRequest): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('byok-keys', { body })
  if (error) {
    throw new Error((await readErrorMessage(error)) ?? error.message)
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error))
  }
  return data
}

/** Local session read — no network, so it is cheap enough to gate every
 *  write on. */
async function isSignedIn(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return Boolean(session)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Account sync
// ---------------------------------------------------------------------------

let syncInFlight: Promise<void> | null = null
let syncedUserId: string | null = null

// Whether this page has ever seen a session. SIGNED_OUT clears the device,
// and a stray SIGNED_OUT with no preceding sign-in would otherwise wipe a
// byok-anon visitor's key — someone who never had an account for it to sync
// to in the first place.
let sawSession = false

/**
 * Resolves when the in-flight sign-in sync has landed, or immediately when
 * there is none.
 *
 * One caller: the Generate button, which would otherwise take the
 * server-funded path in the sub-second window on a fresh device where the
 * account has a key but the cache does not yet.
 */
export function awaitByokSync(): Promise<void> {
  return syncInFlight ?? Promise.resolve()
}

/** Wipes the cache. The account keeps its rows — signing out is leaving this
 *  device, not giving up the key. KEY_PREFERRED is not a key and is left
 *  alone. */
export function clearLocalKeys(): void {
  removeSlot(KEY_ANTHROPIC)
  removeSlot(KEY_OPENAI)
  removeSlot(KEY_MODEL)
  notifyChanged()
}

/**
 * Pulls the account's keys into the cache, and pushes anything the account is
 * missing upward.
 *
 * Nothing is ever deleted by a sync. The account wins where it has a value,
 * the device fills the gaps, and a provider absent from both stays absent —
 * so a sync can promote a byok-anon user's key to their new account, but can
 * never be the reason a key disappears. Deletion is only ever an explicit
 * Remove.
 *
 * Every failure path is a warning and a return: a 404 before the function is
 * deployed, a 503 before the secret is set, or a dropped connection all leave
 * the user exactly where they were, on browser-only keys.
 */
async function syncFromAccount(userId: string): Promise<void> {
  let response: unknown
  try {
    response = await callByokKeys({ action: 'get' })
  } catch (err) {
    console.warn('BYOK account sync failed; keeping browser-only keys:', err)
    return
  }

  // The session can change while the request is in flight — sign out, sign
  // straight back in as someone else. Writing the first account's keys into
  // the second account's browser is the worst outcome available here, so a
  // stale answer is discarded rather than applied.
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id !== userId) return
  } catch {
    return
  }

  const remote = (response ?? {}) as ByokGetResponse
  const pushes: Array<Promise<unknown>> = []
  let moved = false

  for (const provider of PROVIDER_SLOTS) {
    const remoteKey = remote.keys?.[provider] ?? null
    const localKey = readSlot(SLOT[provider])
    if (remoteKey) {
      if (remoteKey !== localKey) {
        writeSlot(SLOT[provider], remoteKey)
        moved = true
      }
    } else if (localKey) {
      pushes.push(callByokKeys({ action: 'set', provider, key: localKey }))
    }
  }

  // getPreferredModel() already filters to ids this build knows, so a
  // preference from a newer bundle is left on the account rather than written
  // into a cache that would resolve it to the provider default anyway.
  const remoteModel = typeof remote.model === 'string' ? remote.model : null
  const localModel = getPreferredModel()
  if (remoteModel && getModelById(remoteModel)) {
    if (remoteModel !== localModel) {
      writeSlot(KEY_MODEL, remoteModel)
      moved = true
    }
  } else if (!remoteModel && localModel) {
    pushes.push(callByokKeys({ action: 'set-model', model: localModel }))
  }

  // Once, after every local write: `byok:changed` is what moves the tier, the
  // model dropdown and lib/limits.ts, and firing it per slot would re-render
  // all three up to three times for one sync.
  if (moved) notifyChanged()

  for (const result of await Promise.allSettled(pushes)) {
    if (result.status === 'rejected') {
      console.warn('BYOK account sync push failed:', result.reason)
    }
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  // Deferred to the next macrotask. supabase-js holds an internal lock for
  // the duration of this callback and warns against calling its auth methods
  // from inside it; the sync needs getSession() for its stale guard.
  setTimeout(() => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      const userId = session?.user?.id
      if (!userId) return
      sawSession = true
      // SIGNED_IN fires again on tab focus and on every token refresh, so the
      // id guard is what keeps this to one sync per account per page load.
      if (userId === syncedUserId) return
      syncedUserId = userId
      const run = syncFromAccount(userId)
      syncInFlight = run
      void run.finally(() => {
        if (syncInFlight === run) syncInFlight = null
      })
      return
    }

    if (event === 'SIGNED_OUT') {
      syncedUserId = null
      // Covers explicit sign-out, cross-tab sign-out, an expired refresh
      // token, and delete-account — all of which should leave the key behind
      // on the account and nothing behind on the device.
      if (sawSession) clearLocalKeys()
    }
  }, 0)
})

// ---------------------------------------------------------------------------
// Per-provider access
// ---------------------------------------------------------------------------

export function getKey(provider: ByokProvider): string | null {
  return readSlot(SLOT[provider])
}

/**
 * Local first, then the account.
 *
 * The cache write is what the UI and any generation started in the next tick
 * read, so it must not wait on a round trip. The push is awaited and its
 * error deliberately propagates: the caller's job is to say "saved here, not
 * on your account", which is true and actionable. A push that never lands
 * self-heals anyway — the next sign-in sync sees a key the account lacks and
 * pushes it upward.
 */
export async function setKey(provider: ByokProvider, key: string): Promise<void> {
  const trimmed = key.trim()
  if (!trimmed) {
    await clearKey(provider)
    return
  }

  writeSlot(SLOT[provider], trimmed)
  notifyChanged()

  if (!(await isSignedIn())) return
  await callByokKeys({ action: 'set', provider, key: trimmed })
}

/**
 * Account first, then local — the opposite order to setKey, on purpose.
 *
 * Local-first would let a failed delete resurrect the key: gone from the
 * browser, still a row on the account, pulled back down by the next sign-in
 * sync with nothing in between to explain it. Throwing before the local
 * removal leaves the user looking at the key they asked to remove, which is
 * at least honest about what happened.
 */
export async function clearKey(provider: ByokProvider): Promise<void> {
  if (await isSignedIn()) {
    await callByokKeys({ action: 'delete', provider })
  }
  removeSlot(SLOT[provider])
  notifyChanged()
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
    writeSlot(KEY_MODEL, seeded)
    return seeded
  }

  return null
}

export async function setPreferredModel(id: string): Promise<void> {
  // Refuse an id the registry does not know: a stale value would resolve to
  // the provider default on every read, which looks like the choice silently
  // not sticking.
  if (!getModelById(id)) return

  writeSlot(KEY_MODEL, id)
  notifyChanged()

  if (!(await isSignedIn())) return
  try {
    // Swallowed rather than propagated, unlike setKey. A dropdown selection
    // has no error surface to put this in, and the worst case is a preference
    // that stays on this device — the next sync pushes it up.
    await callByokKeys({ action: 'set-model', model: id })
  } catch (err) {
    console.warn('BYOK model preference push failed:', err)
  }
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
