import { PLAN_LIMITS, type Plan, type PlanLimits } from '@/constants/plans'

export type LimitKind = 'event' | 'timeline'

export class LimitReachedError extends Error {
  kind: LimitKind
  limit: number
  constructor(kind: LimitKind, limit: number, message?: string) {
    super(message ?? `${kind} limit reached`)
    this.name = 'LimitReachedError'
    this.kind = kind
    this.limit = limit
  }
}

// TODO: swap to a user_profiles.plan lookup once billing/tiers are wired up.
export function getCurrentPlan(): Plan {
  return 'free'
}

export function getCurrentLimits(): PlanLimits {
  return PLAN_LIMITS[getCurrentPlan()]
}

export function isOverEventLimit(eventCount: number): boolean {
  const { eventLimit } = getCurrentLimits()
  return eventLimit !== null && eventCount >= eventLimit
}

export function isOverTimelineLimit(timelineCount: number): boolean {
  const { timelineLimit } = getCurrentLimits()
  return timelineLimit !== null && timelineCount >= timelineLimit
}
