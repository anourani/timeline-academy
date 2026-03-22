import { Month } from '../../types/timeline'

interface TimelineScrollIndicatorProps {
  months: Month[]
  visibleRange: { start: number; end: number }
}

export function TimelineScrollIndicator({
  months,
  visibleRange
}: TimelineScrollIndicatorProps) {
  if (!months.length) {
    return null
  }

  const startIndex = Math.max(0, visibleRange.start)
  const endIndex = Math.min(months.length - 1, Math.max(0, visibleRange.end - 1))

  const leftYear = months[startIndex]?.year
  const rightYear = months[endIndex]?.year

  if (leftYear == null || rightYear == null) {
    return null
  }

  return (
    <div className="flex items-start justify-between px-[24px] pointer-events-none font-mono text-[24px] text-[#9b9ea3] whitespace-nowrap">
      <span>{leftYear}</span>
      <span>{rightYear}</span>
    </div>
  )
}
