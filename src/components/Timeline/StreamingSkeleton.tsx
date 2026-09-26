import { useMemo } from 'react'

/**
 * `[row, x, textWidth]` at a 1600px viewport, scaled to the real one.
 *
 * Fixed rather than random: a pattern regenerated per render would reshuffle
 * on every streamed event, and one regenerated per mount would make the same
 * subject look different each time for no reason. These are eyeballed to
 * read as plausible timeline content — varied widths, uneven gaps, no two
 * rows aligned.
 */
const BARS: Array<[row: number, x: number, textWidth: number]> = [
  [0, 40, 210], [0, 540, 180], [0, 1000, 240],
  [1, 210, 160], [1, 720, 230], [1, 1250, 170],
  [2, 90, 250], [2, 880, 190], [2, 1390, 150],
  [3, 380, 200], [3, 1110, 220],
  [4, 620, 170], [4, 1300, 200],
  [5, 250, 180], [5, 960, 210],
]

const REFERENCE_WIDTH = 1600
const BLOCK_WIDTH = 8
const BLOCK_GAP = 6
const TEXT_HEIGHT = 14
const ENTER_MS = 350
const ENTER_STAGGER_MS = 35
const PULSE_OFFSET_MS = 120
const EXIT_MS = 300
/** An event whose left edge comes within this of a bar has covered it. */
const RECEDE_LEAD_PX = 40

interface StreamingSkeletonProps {
  /** Row height in px, so bars sit on the same rhythm as real events. */
  rowHeight: number
  /**
   * Left edge of the furthest-right event revealed so far, in the same
   * viewport pixels as `BARS`. Bars to the left of it fade out.
   *
   * Null before the first event, when every bar is still standing.
   */
  revealedThroughX: number | null
  /** Fades everything out together, for the moment the stream ends. */
  exiting?: boolean
}

/**
 * Placeholder events, receding ahead of the real ones.
 *
 * The point is not to look busy — it is to show the shape of what is coming
 * before it arrives, so the canvas reads as filling in rather than as empty.
 * Because the stream emits events in ascending date order, a bar can be
 * retired the moment a real event reaches its position, and the placeholder
 * field visibly pulls back left to right just ahead of the fill.
 *
 * `aria-hidden` throughout, per the house rule in ui/skeleton.tsx: the wait
 * is announced once by a live region beside the canvas, not by fifteen
 * pulsing boxes.
 */
export function StreamingSkeleton({
  rowHeight,
  revealedThroughX,
  exiting = false,
}: StreamingSkeletonProps) {
  const scale = useMemo(
    () =>
      typeof window === 'undefined' ? 1 : window.innerWidth / REFERENCE_WIDTH,
    [],
  )

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none overflow-hidden"
    >
      {BARS.map(([row, x, textWidth], i) => {
        const left = x * scale
        const width = textWidth * scale
        // Dropped rather than squeezed: a bar scaled past the right edge
        // would be a sliver that reads as a rendering fault.
        if (left > window.innerWidth) return null

        const covered =
          revealedThroughX !== null && left <= revealedThroughX + RECEDE_LEAD_PX
        const gone = covered || exiting

        return (
          <div
            key={i}
            className="absolute flex items-center"
            style={{
              top: row * rowHeight + 2,
              left,
              height: rowHeight - 4,
              opacity: gone ? 0 : undefined,
              transition: `opacity ${EXIT_MS}ms var(--ease-enter)`,
              // Only the entrance is an animation; the exit is a transition
              // on the same property. Leaving both as animations would mean
              // the fade-out fights a fade-in that has not finished.
              animation: gone
                ? undefined
                : `timeline-intro-fade-in ${ENTER_MS}ms var(--ease-enter) ${
                    i * ENTER_STAGGER_MS
                  }ms both`,
            }}
          >
            <div
              className="rounded-[4px] bg-white/[0.08] animate-pulse"
              style={{
                width: BLOCK_WIDTH,
                height: rowHeight - 4,
                // Offset so the field shimmers rather than blinking in
                // unison, which reads as one object rather than many.
                animationDelay: `${i * PULSE_OFFSET_MS}ms`,
              }}
            />
            <div
              className="rounded-[4px] bg-white/[0.08] animate-pulse"
              style={{
                width,
                height: TEXT_HEIGHT,
                marginLeft: BLOCK_GAP,
                animationDelay: `${i * PULSE_OFFSET_MS}ms`,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
