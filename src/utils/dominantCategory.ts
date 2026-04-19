import type { CategoryConfig } from '@/types/event'

export const DEFAULT_DOT_COLOR = '#4196E4'

interface CategoryEvent {
  category?: string | null
}

export function computeDominantCategoryColor(
  events: readonly CategoryEvent[],
  categories: readonly CategoryConfig[],
): string {
  if (events.length === 0) return DEFAULT_DOT_COLOR

  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.category) counts.set(e.category, (counts.get(e.category) || 0) + 1)
  }
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
