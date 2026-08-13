import { cn } from '@/lib/utils'

/**
 * A labelled usage bar: `label · used/cap · ▬▬▬`.
 *
 * The app's first `role="progressbar"` — usage was reported as bare text
 * everywhere before this, which is accurate but says nothing about how close a
 * cap actually is.
 *
 * Two surfaces render it and they nest in opposite directions, which is why the
 * track tone is a prop rather than a constant: the side panel's card is #0A0A0A
 * with the meter sub-card stepping *up* to #171717, while the account modal is
 * #171717 with its rows recessed *down* to #0A0A0A. One tone cannot read on
 * both.
 *
 * The label and value share a single fixed-width head group rather than sizing
 * to their content, so every bar starts at the same x — including across the
 * modal's separate per-row cards, which no shared grid parent could span.
 */

type UsageMeterSize = 'sm' | 'md'

const SIZES = {
  sm: {
    gap: 'gap-2',
    head: 'w-[112px] gap-1.5',
    label: "font-['Avenir',sans-serif] text-[12px] leading-[140%] font-medium text-[#C9CED4]",
    value:
      "font-['Avenir',sans-serif] text-[12px] leading-[140%] font-normal text-[#9B9EA3] tabular-nums",
  },
  md: {
    gap: 'gap-2.5',
    head: 'w-[148px] gap-2',
    label: "font-['Avenir',sans-serif] text-[13px] leading-[18px] text-[#C9CED4]",
    value: "font-['Avenir',sans-serif] text-[13px] leading-[18px] text-[#9B9EA3] tabular-nums",
  },
} as const

interface UsageMeterProps {
  label: string
  count: number
  /**
   * `null` is this codebase's spelling of "no limit" (see `isOverEventLimit`).
   * It renders the word "Unlimited" in the bar slot rather than a bar: a full
   * one would say "you are maxed out" and an empty one "you have nothing", and
   * both are false.
   */
  limit: number | null
  /** 'sm' for the side panel, 'md' for the account modal. */
  size?: UsageMeterSize
  /**
   * First load not yet resolved. `useEventUsage` starts both counts at 0, so
   * without this every mount paints an empty bar and then animates it up —
   * which looks far more like real data than the text tiles ever did.
   */
  pending?: boolean
  /** Container chrome. Each consumer supplies its own surface. */
  className?: string
  /** Track tone, which depends on the parent surface. See the note above. */
  trackClass?: string
}

/**
 * Fill percentage, clamped at both ends. A count can exceed its cap after a
 * downgrade — removing an API key drops byok's 1200 to free's 300 with the
 * events still in place — so the top clamp is a real case, not defensiveness.
 */
function meterPercent(count: number, limit: number): number {
  if (!Number.isFinite(count)) return 0
  // A zero cap is not "0% used". Any usage at all against it is over.
  if (limit <= 0) return count > 0 ? 100 : 0
  return Math.min(100, Math.max(0, (count / limit) * 100))
}

export function UsageMeter({
  label,
  count,
  limit,
  size = 'sm',
  pending = false,
  className,
  trackClass = 'bg-[#0A0A0A]',
}: UsageMeterProps) {
  const s = SIZES[size]

  const head = (
    <div className={cn('flex flex-row items-baseline shrink-0', s.head)}>
      <span className={cn('flex-1 min-w-0 truncate', s.label)}>{label}</span>
      <span className={cn('shrink-0', s.value)}>
        {pending ? '—' : count}
        {limit == null ? '' : `/${limit}`}
      </span>
    </div>
  )

  // No cap means no range to draw against, so there is no progressbar either.
  if (limit == null) {
    return (
      <div className={cn('flex flex-row items-center', s.gap, className)}>
        {head}
        <span className={cn('flex-1 text-[#6B6E73]', s.value)}>Unlimited</span>
      </div>
    )
  }

  const pct = pending ? 0 : meterPercent(count, limit)
  const isOver = !pending && count > limit

  return (
    <div className={cn('flex flex-row items-center', s.gap, className)}>
      {head}
      {/* Omitting aria-valuenow while pending is what marks the bar
          indeterminate; aria-valuetext carries the real count once it lands, so
          an over-cap state reads "14 of 10" rather than the clamped 100%. */}
      <div
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={pending ? undefined : count}
        aria-valuetext={pending ? undefined : `${count} of ${limit}`}
        aria-busy={pending || undefined}
        className={cn('flex-1 min-w-[40px] h-[6px] rounded-full overflow-hidden', trackClass)}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none',
            isOver ? 'bg-destructive' : 'bg-[#2563EB]'
          )}
          // A nonzero count must never render as nothing, so a sliver survives
          // rounding. `rounded-full` makes it a dot rather than a chip.
          style={{ width: `${pct}%`, minWidth: !pending && count > 0 ? 3 : 0 }}
        />
      </div>
    </div>
  )
}
