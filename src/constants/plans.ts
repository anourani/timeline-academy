// Numbers here must stay in sync with the SQL get_plan_limits function
// defined in supabase/migrations/20260416000000_event_limit.sql.

export type Plan = 'free' | 'tier2' | 'tier3'

export interface PlanLimits {
  eventLimit: number | null
  timelineLimit: number | null
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { eventLimit: 150, timelineLimit: 10 },
  tier2: { eventLimit: 600, timelineLimit: 25 },
  tier3: { eventLimit: null, timelineLimit: null },
}
