import { useState, useCallback } from 'react'
import {
  DEFAULT_WORLD_EVENT_SETTINGS,
  type WorldEventSettings,
} from '@/types/worldEvents'

/**
 * The World Events lane's per-timeline settings, held like the scales:
 * plain editor state, hydrated from whichever store the timeline came from and
 * persisted by that store's save path.
 */
export function useWorldEventSettings() {
  const [worldEvents, setWorldEvents] = useState<WorldEventSettings>(DEFAULT_WORLD_EVENT_SETTINGS)

  const handleWorldEventsChange = useCallback((value: WorldEventSettings) => {
    setWorldEvents(value)
  }, [])

  return { worldEvents, handleWorldEventsChange }
}
