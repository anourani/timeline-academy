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
  const startMonthIndex = Math.max(0, Math.floor(visibleRange.start / 4))
  const leftYear = months[startMonthIndex]?.year

  return (
    <div
      className="flex items-start px-[24px] pointer-events-none font-mono text-[24px] text-[#9b9ea3] whitespace-nowrap"
      style={{ height: SCROLL_INDICATOR_HEIGHT }}
    >
      {leftYear != null && <span>{leftYear}</span>}
    </div>
  )
}
