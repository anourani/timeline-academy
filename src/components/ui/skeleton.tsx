import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/**
 * Loading placeholders.
 *
 * Not the stock shadcn skeleton — the shape here is the one already established
 * by `AIMode/SubjectSuggestions.tsx`: a 14px bar on `bg-white/[0.08]`, pulsing,
 * and `aria-hidden` so a screen reader is told its container is busy rather
 * than read out a row of empty boxes. Anything that announces the wait belongs
 * in a live region beside the skeleton, never in the skeleton itself.
 */

export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn('rounded-[4px] bg-white/[0.08] animate-pulse', className)}
    />
  )
}

/**
 * A block of bars standing in for a paragraph.
 *
 * Sized to the `body-m` rhythm (`index.css` — 14px text on a 20px line), so
 * `lines` bars occupy roughly the height `lines` real lines will. Widths taper
 * and the last bar is always the short one, which is what makes a stack of
 * rectangles read as prose rather than as a table.
 */
const BODY_WIDTHS = ['100%', '96%', '100%', '92%', '98%', '100%', '94%', '97%']
const LAST_LINE_WIDTH = '58%'

export function SkeletonText({
  lines = 4,
  widths = BODY_WIDTHS,
  className,
}: {
  lines?: number
  widths?: string[]
  className?: string
}) {
  return (
    <div aria-hidden="true" className={cn('flex flex-col gap-[6px]', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-[14px]"
          style={{
            width: i === lines - 1 ? LAST_LINE_WIDTH : widths[i % widths.length],
          }}
        />
      ))}
    </div>
  )
}
