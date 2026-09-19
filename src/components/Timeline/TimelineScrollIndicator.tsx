import { memo } from 'react'
import { Month } from '../../types/timeline'
import { SCROLL_INDICATOR_HEIGHT } from '../../constants/timeline'

interface TimelineScrollIndicatorProps {
  months: Month[]
  visibleRange: { start: number; end: number }
}

/**
 * The year readout that used to sit above the canvas.
 *
 * Deliberately mounted nowhere: it duplicated the grid's own year labels
 * directly below it and the chapters strip directly above, so the row was
 * removed and the 36px given back to the canvas. Kept intact — rather than
 * deleted — because the year is hidden for now, not ruled out; re-rendering it
 * in `Timeline` and restoring `SCROLL_INDICATOR_HEIGHT` to the category-label
 * offset there is the whole of bringing it back.
 */
export const TimelineScrollIndicator = memo(function TimelineScrollIndicator({
  months,
  visibleRange
}: TimelineScrollIndicatorProps) {
  const startMonthIndex = Math.max(0, Math.floor(visibleRange.start / 4))
  const leftYear = months[startMonthIndex]?.year

  return (
    <div
      className="flex items-start px-[16px] md:px-[24px] pointer-events-none font-mono text-[20px] md:text-[24px] text-[#9b9ea3] whitespace-nowrap overflow-hidden"
      style={{ height: SCROLL_INDICATOR_HEIGHT }}
    >
      {leftYear != null && <span>{leftYear}</span>}
    </div>
  )
})
