import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { getCurrentLimits } from '@/lib/limits'

interface EventUsage {
  eventCount: number
  eventLimit: number | null
  timelineCount: number
  timelineLimit: number | null
  isLoading: boolean
  refetch: () => Promise<void>
}

export function useEventUsage(): EventUsage {
  const { user } = useAuth()
  const { eventLimit, timelineLimit } = getCurrentLimits()
  const [eventCount, setEventCount] = useState(0)
  const [timelineCount, setTimelineCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!user) {
      setEventCount(0)
      setTimelineCount(0)
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
  }, [user])

  useEffect(() => {
    refetch()
    if (!user) return

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
  }, [user, refetch])

  return { eventCount, eventLimit, timelineCount, timelineLimit, isLoading, refetch }
}
