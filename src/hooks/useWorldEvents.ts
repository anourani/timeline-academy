import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchWorldEvents, type WorldEventsContext } from '@/services/worldEvents'
import {
  getCachedWorldEvents,
  setCachedWorldEvents,
  updateCachedWorldEvent,
  type WorldEventsCacheKey,
} from '@/services/worldEventCache'
import type { TimelineYearRange } from '@/utils/dateUtils'
import {
  WORLD_EVENT_SOURCES,
  type WorldEvent,
  type WorldEventSettings,
  type WorldEventsStatus,
} from '@/types/worldEvents'

interface UseWorldEventsOptions {
  /** The timeline (or draft) these results belong to; the cache is keyed on it. */
  timelineId: string | null
  settings: WorldEventSettings
  /** The axis's year span. Null while there is nothing to draw yet. */
  range: TimelineYearRange | null
  /** The timeline's subject, and what else it covers. Both decide what is
   *  relevant, but neither is a refetch trigger: results are cached per
   *  range and source, and a retitle or an edit shouldn't spend an AI call. */
  subject: string
  context: WorldEventsContext
  /** True while a generation streams: the lane waits for the timeline to settle. */
  paused: boolean
  /** Signed in or holding a key. Without either there is nothing to call. */
  aiAvailable: boolean
}

export interface UseWorldEventsResult {
  events: WorldEvent[]
  status: WorldEventsStatus
  retry: () => void
  /** Keep an enriched copy (description, image) of one World Events entry. */
  updateEvent: (updated: WorldEvent) => void
}

function keyString(k: WorldEventsCacheKey): string {
  return `${k.timelineId}:${k.source}:${k.source === 'country' ? k.country : '-'}:${k.startYear}-${k.endYear}`
}

/**
 * The World Events lane's data: one AI fetch per enabled source, cached per
 * (timeline, source, country, range) so that toggling a chip is instant after
 * the first fetch and never spends a second call.
 */
export function useWorldEvents({
  timelineId,
  settings,
  range,
  subject,
  context,
  paused,
  aiAvailable,
}: UseWorldEventsOptions): UseWorldEventsResult {
  const [results, setResults] = useState<Record<string, WorldEvent[]>>({})
  const [errors, setErrors] = useState<Record<string, true>>({})
  const [retryNonce, setRetryNonce] = useState(0)

  const subjectRef = useRef(subject)
  subjectRef.current = subject
  const contextRef = useRef(context)
  contextRef.current = context

  const active =
    settings.showWorldEvents && aiAvailable && !paused && !!timelineId && !!range

  // Stable across renders for the same request, so the effect only re-runs
  // when what would be fetched actually changes.
  const sourcesKey = WORLD_EVENT_SOURCES.filter((s) => settings.worldEventSources.includes(s)).join(',')
  const startYear = range?.startYear ?? 0
  const endYear = range?.endYear ?? 0
  const requests = useMemo<WorldEventsCacheKey[]>(() => {
    if (!active || !timelineId) return []
    return (sourcesKey ? sourcesKey.split(',') : []).map((source) => ({
      timelineId,
      source: source as WorldEventsCacheKey['source'],
      country: settings.worldEventCountry,
      startYear,
      endYear,
    }))
  }, [active, timelineId, sourcesKey, settings.worldEventCountry, startYear, endYear])

  useEffect(() => {
    if (requests.length === 0) return
    const controller = new AbortController()

    for (const req of requests) {
      const k = keyString(req)
      const cached = getCachedWorldEvents(req)
      if (cached) {
        setResults((prev) => (prev[k] === cached ? prev : { ...prev, [k]: cached }))
        continue
      }
      fetchWorldEvents(
        { ...req, subject: subjectRef.current, context: contextRef.current },
        controller.signal,
      )
        .then((events) => {
          if (controller.signal.aborted) return
          setCachedWorldEvents(req, events)
          setResults((prev) => ({ ...prev, [k]: events }))
          setErrors((prev) => {
            if (!prev[k]) return prev
            const next = { ...prev }
            delete next[k]
            return next
          })
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return
          console.warn('World events fetch failed:', err)
          setErrors((prev) => ({ ...prev, [k]: true }))
        })
    }

    return () => controller.abort()
  }, [requests, retryNonce])

  const keys = useMemo(() => requests.map(keyString), [requests])
  const events = useMemo(() => keys.flatMap((k) => results[k] ?? []), [keys, results])
  let status: WorldEventsStatus = 'idle'
  if (keys.length > 0) {
    if (keys.some((k) => errors[k])) status = 'error'
    else if (keys.some((k) => !results[k])) status = 'loading'
    else status = 'ready'
  }

  const retry = useCallback(() => {
    setErrors({})
    setRetryNonce((n) => n + 1)
  }, [])

  const updateEvent = useCallback(
    (updated: WorldEvent) => {
      setResults((prev) => {
        const next: Record<string, WorldEvent[]> = {}
        for (const [k, list] of Object.entries(prev)) {
          next[k] = list.some((e) => e.id === updated.id)
            ? list.map((e) => (e.id === updated.id ? updated : e))
            : list
        }
        return next
      })
      if (timelineId) updateCachedWorldEvent(timelineId, updated)
    },
    [timelineId],
  )

  return { events, status, retry, updateEvent }
}
