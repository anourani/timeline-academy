import { useEvents } from './useEvents'
import { useTimelineTitle } from './useTimelineTitle'
import { useCategories } from './useCategories'
import { useTimelineScale } from './useTimelineScale'
import { useGroupByCategory } from './useGroupByCategory'

export function useTimelineState() {
  const { events, addEvent, addEvents, clearEvents, setEvents, updateEvent } = useEvents()
  const { title, description, setTitle, setDescription, resetTitle } = useTimelineTitle()
  const { categories, updateCategories, resetCategories } = useCategories()
  const { scale, currentScale, handleScaleChange } = useTimelineScale()
  const { groupByCategory, handleGroupByCategoryChange } = useGroupByCategory()

  return {
    // State
    events, title, description, categories, scale, currentScale, groupByCategory,
    // Event actions
    addEvent, addEvents, clearEvents, setEvents, updateEvent,
    // Title actions
    setTitle, setDescription, resetTitle,
    // Category actions
    updateCategories, resetCategories,
    // Scale actions
    handleScaleChange,
    // Layout actions
    handleGroupByCategoryChange,
  }
}
