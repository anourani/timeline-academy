import { useEvents } from './useEvents'
import { useTimelineTitle } from './useTimelineTitle'
import { useCategories } from './useCategories'
import { useTimelineScale } from './useTimelineScale'
import { useTimelineVerticalScale } from './useTimelineVerticalScale'
import { useGroupByCategory } from './useGroupByCategory'

export function useTimelineState() {
  const { events, addEvent, addEvents, clearEvents, setEvents, updateEvent } = useEvents()
  const { title, description, setTitle, setDescription, resetTitle } = useTimelineTitle()
  const { categories, updateCategories, resetCategories } = useCategories()
  const { scale, currentScale, handleScaleChange } = useTimelineScale()
  const { verticalScale, currentVerticalScale, handleVerticalScaleChange } = useTimelineVerticalScale()
  const { groupByCategory, handleGroupByCategoryChange } = useGroupByCategory()

  return {
    // State
    events, title, description, categories, scale, currentScale, verticalScale, currentVerticalScale, groupByCategory,
    // Event actions
    addEvent, addEvents, clearEvents, setEvents, updateEvent,
    // Title actions
    setTitle, setDescription, resetTitle,
    // Category actions
    updateCategories, resetCategories,
    // Scale actions
    handleScaleChange,
    handleVerticalScaleChange,
    // Layout actions
    handleGroupByCategoryChange,
  }
}
