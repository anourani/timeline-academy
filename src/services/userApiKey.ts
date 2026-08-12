import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ByokCredential, ByokProvider } from '@/types/ai'

// Storage slots, one per provider plus the user's preferred default.
//
// The Anthropic slot name predates multi-provider support and MUST NOT change.
// Renaming it is silent data loss for every existing BYOK user: no error, no
// migration, they simply drop to the trial tier with their key still sitting
// in localStorage under the old name.
const KEY_ANTHROPIC = 'timeline_byok_anthropic_key'
const KEY_OPENAI = 'timeline_byok_openai_key'
const KEY_PREFERRED = 'timeline_byok_provider'

const SLOT: Record<ByokProvider, string> = {
  anthropic: KEY_ANTHROPIC,
  openai: KEY_OPENAI,
}

const WATCHED = new Set([KEY_ANTHROPIC, KEY_OPENAI, KEY_PREFERRED])

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

export function getCredentialFor(
  provider: ByokProvider,
): ByokCredential | null {
  const key = getKey(provider)
  return key ? { provider, key } : null
}

// ---------------------------------------------------------------------------
// Preferred provider
// ---------------------------------------------------------------------------

export function getPreferredProvider(): ByokProvider | null {
  const v = readSlot(KEY_PREFERRED)
  return v === 'anthropic' || v === 'openai' ? v : null
}

export function setPreferredProvider(provider: ByokProvider): void {
  try {
    localStorage.setItem(KEY_PREFERRED, provider)
    notifyChanged()
  } catch {
    // ignore
  }
  // Deliberately no reconcile call: a preference change cannot change whether
  // a key exists, so byok_enabled cannot have moved. Skipping it saves a
  // getUser() round-trip on every toggle.
}

// ---------------------------------------------------------------------------
// Resolution — which credential a request should actually use
// ---------------------------------------------------------------------------

/**
 * The single resolution rule, as a pure function so the hook and the
 * imperative getter cannot drift apart.
 */
function resolveActive(
  anthropic: string | null,
  openai: string | null,
  preferred: ByokProvider | null,
): ByokCredential | null {
  if (!anthropic && !openai) return null

  // Exactly one key present: use it and ignore any stale preference.
  //
  // This branch is load-bearing, not an optimisation. A user whose preference
  // says `openai` who then removes their OpenAI key would otherwise read as
  // `byok` to the tier logic (a key exists) but as "no key" to the routing
  // logic — a split brain that surfaces as a sign-in gate they should never
  // see. The preference is deliberately NOT cleared when its provider's key
  // is removed: this rule covers the gap, and re-adding that key restores the
  // user's stated intent.
  if (!openai) return { provider: 'anthropic', key: anthropic as string }
  if (!anthropic) return { provider: 'openai', key: openai }

  // Both present: honour the preference, defaulting to Anthropic so users who
  // had a key before OpenAI support existed keep the behaviour they had.
  const preference = preferred ?? 'anthropic'
  return preference === 'openai'
    ? { provider: 'openai', key: openai }
    : { provider: 'anthropic', key: anthropic }
}

export function getActiveCredential(): ByokCredential | null {
  return resolveActive(
    readSlot(KEY_ANTHROPIC),
    readSlot(KEY_OPENAI),
    getPreferredProvider(),
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
  preferred: ByokProvider | null
}

function snapshot(): ByokKeyState {
  return {
    anthropic: readSlot(KEY_ANTHROPIC),
    openai: readSlot(KEY_OPENAI),
    preferred: getPreferredProvider(),
  }
}

/** Both keys plus the stored preference. Re-renders on change in any tab. */
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
            prev.preferred === next.preferred
            ? prev
            : next
        }),
      ),
    [],
  )

  return state
}

/** The credential a request would actually use right now, or null. */
export function useByokCredential(): ByokCredential | null {
  const { anthropic, openai, preferred } = useByokKeys()
  return useMemo(
    () => resolveActive(anthropic, openai, preferred),
    [anthropic, openai, preferred],
  )
}

/** Whether any BYOK key exists — the second axis of useAccountTier. */
export function useHasByokKey(): boolean {
  const [has, setHas] = useState<boolean>(hasAnyKey)
  useEffect(() => subscribe(() => setHas(hasAnyKey())), [])
  return has
}
