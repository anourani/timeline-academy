import { Month } from '../../types/timeline'
import { SCROLL_INDICATOR_HEIGHT } from '../../constants/timeline'

interface TimelineScrollIndicatorProps {
  months: Month[]
  visibleRange: { start: number; end: number }
}

export function TimelineScrollIndicator({
  months,
  visibleRange
}: TimelineScrollIndicatorProps) {
  // visibleRange indices are quarter-based (useTimelineScroll receives months.length * 4)
  // Convert to month indices by dividing by 4
  const startMonthIndex = Math.max(0, Math.floor(visibleRange.start / 4))
  const endMonthIndex = Math.min(months.length - 1, Math.floor(Math.max(0, visibleRange.end - 1) / 4))

  const leftYear = months[startMonthIndex]?.year
  const rightYear = months[endMonthIndex]?.year

  return (
    <div
      className="flex items-start justify-between px-[24px] pointer-events-none font-mono text-[24px] text-[#9b9ea3] whitespace-nowrap"
      style={{ height: SCROLL_INDICATOR_HEIGHT }}
    >
      {leftYear != null && <span>{leftYear}</span>}
      {rightYear != null && <span>{rightYear}</span>}
    </div>
  )
}
