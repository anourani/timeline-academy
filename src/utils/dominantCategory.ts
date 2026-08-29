import type { CategoryConfig } from '@/types/event'
import { countEventsByCategory } from '@/utils/categoryCounts'

export const DEFAULT_DOT_COLOR = '#4196E4'

interface CategoryEvent {
  category?: string | null
}

export function computeDominantCategoryColor(
  events: readonly CategoryEvent[],
  categories: readonly CategoryConfig[],
): string {
  if (events.length === 0) return DEFAULT_DOT_COLOR

  const counts = countEventsByCategory(events)
  if (counts.size === 0) return DEFAULT_DOT_COLOR

  let dominantId = ''
  let max = 0
  for (const [id, count] of counts) {
    if (count > max) {
      max = count
      dominantId = id
    }
  }
  return categories.find(c => c.id === dominantId)?.color ?? DEFAULT_DOT_COLOR
}
