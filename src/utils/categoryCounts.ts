interface CategoryEvent {
  category?: string | null
}

/**
 * Count events per category id. Ignores category visibility — a hidden
 * category still reports how many events it holds, which is what lets the
 * legend tell you what you are about to hide.
 */
export function countEventsByCategory(
  events: readonly CategoryEvent[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.category) counts.set(e.category, (counts.get(e.category) || 0) + 1)
  }
  return counts
}

export interface CategorySlice {
  color: string
  count: number
}

/**
 * Events per category as coloured slices, in the timeline's category order —
 * for the proportional strip on a timeline's tile. Categories with no events
 * are left out; events whose category the config doesn't know are dropped
 * rather than guessed at.
 */
export function categoryBreakdown(
  events: readonly CategoryEvent[],
  categories: readonly { id: string; color: string }[],
): CategorySlice[] {
  const counts = countEventsByCategory(events)
  return categories
    .map(c => ({ color: c.color, count: counts.get(c.id) ?? 0 }))
    .filter(s => s.count > 0)
}
