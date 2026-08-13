import type { AccountTier } from '@/hooks/useAccountTier'

/**
 * The user-facing name for each state `useAccountTier()` can return.
 *
 * One module because three surfaces name these states — the account row at the
 * bottom of the side panel, the Account Details modal, and `UsageLimits` — and
 * three files inventing their own wording is how the same tier ends up called
 * "Your API key" in one place and "API Key Connected" in another. Same reason
 * `constants/byokProviders.ts` exists for provider names.
 *
 * `byok-anon` and `byok` share a label deliberately. They differ in where the
 * work is stored, not in what the key does, and limits do not vary by provider
 * — so the row has nothing tier-shaped to say that distinguishes them. The
 * account/no-account difference is already carried by the identity beside it.
 */
export const TIER_LABELS: Record<Exclude<AccountTier, 'loading'>, string> = {
  trial: 'Not saved',
  'byok-anon': 'Your API key',
  free: 'Free',
  byok: 'Your API key',
}

/**
 * What each tier actually grants, for surfaces with room to explain rather than
 * just label. Kept beside the labels so the two cannot drift apart.
 */
export const TIER_DESCRIPTIONS: Record<Exclude<AccountTier, 'loading'>, string> = {
  trial:
    'Timelines you build stay in this tab and are lost when it closes. Sign in or add an API key to keep them.',
  'byok-anon':
    'Drafts are saved in this browser only, and AI runs on your own API key. Sign in to save them to your account.',
  free:
    'Timelines are saved to your account. AI generation runs on our budget, within a daily limit.',
  byok:
    'Timelines are saved to your account, and AI runs on your own API key rather than our budget.',
}

/**
 * The name shown where an account would be. Not a tier label — this is the
 * identity slot, and the two anonymous states have no identity to put in it.
 */
export const ANONYMOUS_IDENTITY = 'Guest'

/**
 * The part of an email shown on the account row.
 *
 * Returned as-is, never capitalised or otherwise prettified: there is no
 * display-name field to fall back on (identity here is email-only by design),
 * and every transformation that flatters `alex` mangles `o'brien`.
 */
export function emailLocalPart(email: string): string {
  const at = email.indexOf('@')
  return at === -1 ? email : email.slice(0, at)
}

/**
 * The letter for the avatar circle. Skips leading non-alphanumerics so an
 * address like `_alex@…` gets `A` rather than an underscore, and falls back to
 * a dot when there is no alphanumeric at all.
 */
export function avatarInitial(email: string): string {
  const match = emailLocalPart(email).match(/[a-z0-9]/i)
  return match ? match[0].toUpperCase() : '·'
}
