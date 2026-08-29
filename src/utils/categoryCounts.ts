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
