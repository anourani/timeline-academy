import { useAuth } from './useAuth'
import { useHasByokKey } from '@/services/userApiKey'

/**
 * Who the current visitor is, for every purpose that cares.
 *
 * Two independent axes — is there an account, and is there a BYOK key (from
 * either provider) — which together make four states. Before this hook they
 * were re-derived from a bare `!user` in five different files, which worked
 * only while key-presence didn't matter. It does now: a visitor with a key and
 * no account keeps their work in a different place than one with neither.
 *
 *   'loading'    auth hasn't answered yet — do nothing
 *   'trial'      no account, no key  → one sessionStorage timeline, dies with the tab
 *   'byok-anon'  no account, has key → localStorage drafts, unmetered AI (their key)
 *   'free'       account, no key     → Supabase, our AI budget, rate limited
 *   'byok'       account + key       → Supabase, unmetered AI (their key)
 *
 * Which provider the key belongs to is deliberately not an axis: limits are
 * identical either way, so the tier table stays two-dimensional.
 *
 * Only the last three are `Plan`s in constants/plans.ts. Trial has no limits to
 * enforce and no row in the tier table — it is a state, not a tier.
 */
export type AccountTier = 'loading' | 'trial' | 'byok-anon' | 'free' | 'byok'

export function useAccountTier(): AccountTier {
  const { user, authReady } = useAuth()
  const hasKey = useHasByokKey()

  // `user` is null both before the session lookup answers and when genuinely
  // signed out. Answering 'trial' during that window would point a signed-in
  // user's editor at the trial store and hand their work to the wrong home —
  // the same trap the hydration effect in App.tsx guards against.
  if (!authReady) return 'loading'

  if (!user) return hasKey ? 'byok-anon' : 'trial'
  return hasKey ? 'byok' : 'free'
}

/** True for the two states whose content lives in the browser, not Supabase. */
export function isAnonymousTier(tier: AccountTier): boolean {
  return tier === 'trial' || tier === 'byok-anon'
}
