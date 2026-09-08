import { memo } from 'react'
import { Month } from '../../types/timeline'
import { SCROLL_INDICATOR_HEIGHT } from '../../constants/timeline'

interface TimelineScrollIndicatorProps {
  months: Month[]
  visibleRange: { start: number; end: number }
  /** The chapter the viewport is inside, shown after the year. Absent on a
   *  timeline with no chapters, which leaves the bare year as before. */
  chapterLabel?: string
}

export const TimelineScrollIndicator = memo(function TimelineScrollIndicator({
  months,
  visibleRange,
  chapterLabel
}: TimelineScrollIndicatorProps) {
  const startMonthIndex = Math.max(0, Math.floor(visibleRange.start / 4))
  const leftYear = months[startMonthIndex]?.year

  return (
    <div
      className="flex items-start px-[16px] md:px-[24px] pointer-events-none font-mono text-[20px] md:text-[24px] text-[#9b9ea3] whitespace-nowrap overflow-hidden"
      style={{ height: SCROLL_INDICATOR_HEIGHT }}
    >
      {leftYear != null && <span>{leftYear}</span>}
      {leftYear != null && chapterLabel && (
        <>
          <span className="text-[#4E5052] px-[8px] md:px-[10px]">·</span>
          {/* Truncates rather than pushing the row wide: this sits above the
              canvas, and a long chapter name must not introduce a scrollbar. */}
          <span className="text-[#DADEE5] truncate">{chapterLabel}</span>
        </>
      )}
    </div>
  )
})
