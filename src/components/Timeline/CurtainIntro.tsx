import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BackgroundPattern,
  GRID_COLUMN_SPACING,
  PAGE_GUTTER_SCALE,
} from '@/components/NewTimeline/NewTimelineScreen'

export interface IntroRect {
  top: number
  left: number
  width: number
  height: number
}

interface CurtainIntroProps {
  /** The search composer's box, measured on the way out of AI mode. */
  fromRect: IntroRect
  /** What the user typed. Flies from the field into the nav title. */
  subject: string
  onDone: () => void
}

/** Total life of the overlay: the longest leg (the title flight, 50 + 800)
 *  plus a beat for it to settle before the real nav title takes over. */
const INTRO_MS = 1200
const TITLE_FLIGHT_DELAY_MS = 50
const TITLE_FLIGHT_MS = 800
const GRID_SWIPE_MS = 500
const GRID_STAGGER_MS = 35
const GHOST_FADE_MS = 350

/** The nav title's type. The flight scales rather than re-renders, so the
 *  scale is this over the field's own size. */
const NAV_TITLE_PX = 24

/**
 * Where the composer's input text sits inside the composer's box, and at what
 * size, which the flying title has to match on frame 0. The insets are the 1px
 * border plus the composer's padding. Mirrors `NewTimelineScreen`'s classes at
 * each side of `md`; if those move, these move with them.
 */
interface FieldMetrics {
  fontPx: number
  lineHeightPx: number
  insetX: number
  insetY: number
}
const FIELD_METRICS_MD: FieldMetrics = { fontPx: 18, lineHeightPx: 28, insetX: 21, insetY: 19 }
const FIELD_METRICS_SM: FieldMetrics = { fontPx: 16, lineHeightPx: 24, insetX: 17, insetY: 17 }

function fieldMetrics(): FieldMetrics {
  return typeof window !== 'undefined' &&
    window.matchMedia('(min-width: 768px)').matches
    ? FIELD_METRICS_MD
    : FIELD_METRICS_SM
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * The bridge between the search page and the editor.
 *
 * Pressing Enter navigates immediately, which would otherwise be a hard cut
 * from one full-screen layout to another. This overlay replays the search
 * screen's *exit* on top of the editor: the background fades, the grid lines
 * swipe off, the form drops away, and the typed query flies into the nav
 * title. For the length of it the route change is invisible — frame 0 looks
 * like the page the user was just on.
 *
 * Purely decorative. It is `pointer-events-none`, unmounts itself after
 * `INTRO_MS`, and never gates the stream underneath — if it fails to render
 * the editor is simply there, already filling in.
 */
export function CurtainIntro({ fromRect, subject, onDone }: CurtainIntroProps) {
  const [navRect, setNavRect] = useState<IntroRect | null>(null)
  const [flying, setFlying] = useState(false)
  const reduced = useRef(prefersReducedMotion())
  const field = useRef(fieldMetrics()).current

  // Measured before paint: the flight's start and end have to be known on the
  // same frame the overlay first draws, or the title visibly jumps from the
  // field to an unstyled position before settling.
  useLayoutEffect(() => {
    const el = document.querySelector('[data-timeline-title]')
    if (el) {
      const r = el.getBoundingClientRect()
      setNavRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
  }, [])

  useEffect(() => {
    if (reduced.current) {
      onDone()
      return
    }
    // Two frames, not one: the first commits the resting transform, the
    // second lets the transition pick up the change. A single rAF paints both
    // in the same frame and the browser skips straight to the end state with
    // nothing in between to animate.
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setFlying(true))
    })
    const timer = setTimeout(onDone, INTRO_MS)

    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
      clearTimeout(timer)
    }
  }, [onDone])

  // With reduced motion the editor simply appears, axis already drawn.
  if (reduced.current) return null

  const columnCount =
    typeof window !== 'undefined'
      ? Math.ceil(window.innerWidth / GRID_COLUMN_SPACING) + 1
      : 0

  // Flight geometry. Falling back to the field's own box means a missing nav
  // title degrades to the title fading in place rather than flying to 0,0.
  const target = navRect ?? fromRect
  const scale = NAV_TITLE_PX / field.fontPx
  const startX = fromRect.left + field.insetX
  const startY = fromRect.top + field.insetY
  const dx = target.left - startX
  const dy = target.top + (target.height - field.lineHeightPx * scale) / 2 - startY
  const flightTiming = `${TITLE_FLIGHT_MS}ms var(--ease-swipe) ${TITLE_FLIGHT_DELAY_MS}ms`

  return (
    <div
      className={`fixed inset-0 z-[35] pointer-events-none ${PAGE_GUTTER_SCALE}`}
      aria-hidden="true"
    >
      {/* The page the user was just looking at, dissolving. */}
      <div
        className="absolute inset-0 bg-[#0A0A0A]"
        style={{
          opacity: flying ? 0 : 1,
          transition: `opacity ${GRID_SWIPE_MS}ms var(--ease-enter)`,
        }}
      >
        <BackgroundPattern />
      </div>

      {/* The grid, redrawn as individual lines so each can leave on its own.
          `BackgroundGrid` paints the same columns as a repeating gradient,
          which cannot be animated per line — the geometry is shared through
          GRID_COLUMN_SPACING and --page-gutter so the two agree on frame 0. */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: columnCount }, (_, j) => (
          <div
            key={j}
            className="absolute top-0 bottom-0 w-px bg-[rgba(210,210,210,0.1)]"
            style={{
              left: `calc(var(--page-gutter) + ${j * GRID_COLUMN_SPACING}px)`,
              transform: flying ? 'translateY(-100vh)' : 'translateY(0)',
              transition: `transform ${GRID_SWIPE_MS}ms var(--ease-swipe)`,
              transitionDelay: `${j * GRID_STAGGER_MS}ms`,
            }}
          />
        ))}
      </div>

      {/* The composer itself, dropping away. Only its shell — the heading,
          toolbar and chips are close enough to the fade to not be missed, and
          reproducing them would mean keeping a second copy of that layout in
          step with the real one forever. */}
      <div
        className="absolute rounded-[20px] border border-[#404040] bg-surface-secondary shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        style={{
          top: fromRect.top,
          left: fromRect.left,
          width: fromRect.width,
          height: fromRect.height,
          opacity: flying ? 0 : 1,
          transform: flying ? 'translateY(14px)' : 'translateY(0)',
          transition: `opacity ${GHOST_FADE_MS}ms var(--ease-enter), transform ${GHOST_FADE_MS}ms var(--ease-enter)`,
        }}
      />

      {/* The query, flying into the nav. Transform-only so it composites on
          the GPU; animating top/left would lay out the page 60 times a second
          while the axis behind it is also building.

          Two copies ride the one transform: the input's Avenir, which frame 0
          has to match, cross-fading into the nav title's Aleo, which the real
          title takes over from. A font family cannot be animated, so this is
          the only way to have the right face at both ends. */}
      <span
        className="absolute whitespace-nowrap text-[#DADEE5]"
        style={{
          top: startY,
          left: startX,
          fontSize: `${field.fontPx}px`,
          lineHeight: `${field.lineHeightPx}px`,
          transformOrigin: 'left top',
          transform: flying
            ? `translate(${dx}px, ${dy}px) scale(${scale})`
            : 'translate(0, 0) scale(1)',
          transition: `transform ${flightTiming}`,
        }}
      >
        <span
          className="absolute left-0 top-0 font-['Avenir',sans-serif]"
          style={{ opacity: flying ? 0 : 1, transition: `opacity ${flightTiming}` }}
        >
          {subject}
        </span>
        <span
          className="font-['Aleo',serif] font-normal tracking-[-0.01em]"
          style={{ opacity: flying ? 1 : 0, transition: `opacity ${flightTiming}` }}
        >
          {subject}
        </span>
      </span>
    </div>
  )
}
