import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAccountTier } from '@/hooks/useAccountTier'
import { getCurrentLimits } from '@/lib/limits'
import { byokAnonDraftStore, trialDraftStore, type DraftStore } from '@/utils/draftStorage'

interface EventUsage {
  eventCount: number
  eventLimit: number | null
  timelineCount: number
  timelineLimit: number | null
  isLoading: boolean
  refetch: () => Promise<void>
}

function getLocalDraftUsage(store: DraftStore): { eventCount: number; timelineCount: number } {
  const drafts = store.getAllDrafts()
  const eventCount = drafts.reduce((sum, d) => sum + d.events.length, 0)
  return { eventCount, timelineCount: drafts.length }
}

export function useEventUsage(): EventUsage {
  const { user } = useAuth()
  const tier = useAccountTier()
  // The trial has nothing to enforce — one sessionStorage timeline that costs
  // nothing and vanishes with the tab. `null` is this codebase's existing
  // spelling of "no limit" (see isOverEventLimit), so callers need no new case.
  const { eventLimit, timelineLimit } = tier === 'trial'
    ? { eventLimit: null, timelineLimit: null }
    : getCurrentLimits()
  const localStore = tier === 'trial' ? trialDraftStore : byokAnonDraftStore
  const [eventCount, setEventCount] = useState(0)
  const [timelineCount, setTimelineCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!user) {
      const local = getLocalDraftUsage(localStore)
      setEventCount(local.eventCount)
      setTimelineCount(local.timelineCount)
      setIsLoading(false)
      return
    }
    try {
      const [eventsResult, timelinesResult] = await Promise.all([
        supabase.rpc('get_user_event_count'),
        supabase
          .from('timelines')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ])
      if (eventsResult.error) throw eventsResult.error
      if (timelinesResult.error) throw timelinesResult.error
      setEventCount(typeof eventsResult.data === 'number' ? eventsResult.data : 0)
      setTimelineCount(timelinesResult.count ?? 0)
    } catch (err) {
      console.error('Failed to load event usage:', err)
    } finally {
      setIsLoading(false)
    }
  }, [user, localStore])

  useEffect(() => {
    refetch()

    if (!user) {
      // For logged-out users, poll the browser store every 2s so the counter
      // stays in sync as the user adds/removes events in drafts.
      const interval = setInterval(() => {
        const local = getLocalDraftUsage(localStore)
        setEventCount(local.eventCount)
        setTimelineCount(local.timelineCount)
      }, 2000)
      return () => clearInterval(interval)
    }

    // No user_id column exists on events to filter on server-side; Supabase
    // Realtime enforces RLS on postgres_changes, so this subscription only
    // ever delivers rows belonging to the signed-in user's own timelines.
    // The payload is discarded either way — it just triggers a recount.
    const eventsChannel = supabase
      .channel('event_usage_events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => { refetch() }
      )
      .subscribe()

    const timelinesChannel = supabase
      .channel('event_usage_timelines')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'timelines', filter: `user_id=eq.${user.id}` },
        () => { refetch() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(timelinesChannel)
    }
  }, [user, refetch, localStore])

  return { eventCount, eventLimit, timelineCount, timelineLimit, isLoading, refetch }
}
