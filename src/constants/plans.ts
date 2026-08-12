// Numbers here must stay in sync with the SQL get_plan_limits function
// defined in supabase/migrations/20260505000000_three_tier_model.sql.

// A Plan is a *durable* tier — one whose content outlives the browser tab.
// The ephemeral trial state (no sign-in, no key) is deliberately absent: it
// holds a single sessionStorage timeline, has no limits to enforce and no row
// in the tier comparison UI. Ask `useAccountTier()` for the full picture.
export type Plan = 'byok-anon' | 'free' | 'byok'

export interface PlanLimits {
  eventLimit: number | null
  timelineLimit: number | null
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  // Has a BYOK key (either provider) but no account: browser-only drafts.
  'byok-anon': { eventLimit: 150, timelineLimit: 3 },
  free: { eventLimit: 300, timelineLimit: 10 },
  byok: { eventLimit: 1200, timelineLimit: 25 },
}
