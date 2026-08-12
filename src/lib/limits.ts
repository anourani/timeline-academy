import { PLAN_LIMITS, type Plan, type PlanLimits } from '@/constants/plans'
import { hasAnyKey } from '@/services/userApiKey'
import { supabase } from './supabase'

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

// Module-level cached plan. Kept in sync via Supabase auth state changes
// and the 'byok:changed' event dispatched from userApiKey.ts. Stays sync
// for callers; the cache may lag by one frame after auth/key transitions,
// but the next render after the listener fires corrects it.
//
// Deliberately resolves only the three *durable* plans — the ephemeral trial
// state is not represented here. Everything downstream of this module either
// runs signed-in only (useTimeline, useAIMode) or wants byok-anon's numbers;
// the one place that needs to say "limits don't apply" is useEventUsage, which
// asks useAccountTier() directly rather than routing through this cache.
let cachedPlan: Plan = 'byok-anon'

async function refreshPlan(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    cachedPlan = 'byok-anon'
    return
  }
  cachedPlan = hasAnyKey() ? 'byok' : 'free'
}

void refreshPlan()
supabase.auth.onAuthStateChange(() => {
  void refreshPlan()
})
if (typeof window !== 'undefined') {
  window.addEventListener('byok:changed', () => {
    void refreshPlan()
  })
}

export function getCurrentPlan(): Plan {
  return cachedPlan
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
