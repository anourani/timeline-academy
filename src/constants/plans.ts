// Numbers here must stay in sync with the SQL get_plan_limits function
// defined in supabase/migrations/20260505000000_three_tier_model.sql.

export type Plan = 'guest' | 'free' | 'byok'

export interface PlanLimits {
  eventLimit: number | null
  timelineLimit: number | null
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  guest: { eventLimit: 150, timelineLimit: 3 },
  free: { eventLimit: 300, timelineLimit: 10 },
  byok: { eventLimit: 1200, timelineLimit: 25 },
}
