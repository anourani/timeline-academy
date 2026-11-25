import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { EASE_ENTER, EASE_SWIPE, EVENT_VIEW_MOTION as M } from '@/constants/motion'

// The event view's defining motion: the clicked bar grows into the page, and
// closing shrinks the page back into the bar
// (docs/2026-11-24-event-view-prd.md §4).
//
// Everything runs through the Web Animations API rather than CSS transitions
// because an interrupted open must reverse from wherever it has got to — an
// `Animation` can `reverse()` mid-flight, a transition between two class
// states cannot. Only `clip-path`, `transform`, `opacity` and the layer's
// background are animated: the layer is one fixed, full-viewport element whose
// visible area is a `clip-path: inset(…)` that starts at the bar's rectangle,
// so nothing is laid out during the animation.
//
// The editor or viewer underneath is the whole React root (`#root`; the view
// itself is portalled to `<body>`, outside it). It is pushed back and faded
// while the page opens, and made `inert` for as long as the page is up.

type Phase = 'idle' | 'opening' | 'open' | 'closing'

interface Rect {
  top: number
  left: number
  right: number
  bottom: number
}

const PAGE_BG = '#0B0B0B'
const FULL = 'inset(0px 0px 0px 0px round 0px)'
/** The bar's corner radius in `TimelineEvent`. */
const BAR_RADIUS = 4

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

function findBar(eventId: string): HTMLElement | null {
  if (!eventId || typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(eventId)}"]`)
}

/** The bar's on-screen rectangle, clamped to the viewport; null when it is not on screen. */
function visibleRect(el: HTMLElement): Rect | null {
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (r.width === 0 || r.height === 0) return null
  if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return null
  return {
    top: Math.max(0, r.top),
    left: Math.max(0, r.left),
    right: Math.min(vw, r.right),
    bottom: Math.min(vh, r.bottom),
  }
}

function insetFor(r: Rect): string {
  const right = window.innerWidth - r.right
  const bottom = window.innerHeight - r.bottom
  return `inset(${r.top}px ${right}px ${bottom}px ${r.left}px round ${BAR_RADIUS}px)`
}

/** The bar's own fill: its category colour at 45%, as `TimelineEvent` paints it. */
function tintOf(color: string | undefined): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return `${color}73`
  return 'rgba(155, 158, 163, 0.45)'
}

/** Push the root back around the bar's centre, in the root's own coordinates. */
function setPushOrigin(root: HTMLElement, rect: Rect) {
  const box = root.getBoundingClientRect()
  const x = (rect.left + rect.right) / 2 - box.left
  const y = (rect.top + rect.bottom) / 2 - box.top
  root.style.transformOrigin = `${x}px ${y}px`
}

export interface EventMorph {
  /** Run the open choreography. Call once the layer is in the DOM, before paint. */
  open: (eventId: string) => void
  /** Run the close choreography; resolves when the page has gone. */
  close: (eventId: string) => Promise<void>
}

export function useEventMorph(layerRef: RefObject<HTMLElement>): EventMorph {
  const animsRef = useRef<Animation[]>([])
  const pushRef = useRef<Animation | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const pageOverflowRef = useRef<string | null>(null)
  // Counts opens and closes, so a close that finishes after a newer open has
  // started can tell it no longer owns the layer.
  const runRef = useRef(0)

  const reset = useCallback(() => {
    animsRef.current.forEach((a) => a.cancel())
    animsRef.current = []
    pushRef.current = null
    const root = document.getElementById('root')
    if (root) {
      root.inert = false
      root.style.transformOrigin = ''
      root.style.willChange = ''
    }
    if (pageOverflowRef.current !== null) {
      document.documentElement.style.overflow = pageOverflowRef.current
      pageOverflowRef.current = null
    }
    phaseRef.current = 'idle'
  }, [])

  // Never leave the editor inert or pushed back if the view unmounts mid-way.
  useEffect(() => reset, [reset])

  const open = useCallback(
    (eventId: string) => {
      const layer = layerRef.current
      if (!layer) return
      runRef.current++
      reset()
      // A finished close leaves the layer hidden (see `close`).
      layer.style.visibility = ''
      phaseRef.current = 'opening'

      const root = document.getElementById('root')
      if (root) root.inert = true
      // Clip the page while the view is up: it stops the page behind from
      // scrolling, and keeps the pushed-back root (scaled past the viewport)
      // from counting as overflow — a phone browser otherwise widens its
      // layout viewport to fit it, dragging this fixed layer wider than the
      // screen. `<html>`, not `<body>`: it is the one mobile browsers honour.
      pageOverflowRef.current = document.documentElement.style.overflow
      document.documentElement.style.overflow = 'hidden'
      const anims: Animation[] = []

      if (prefersReducedMotion()) {
        anims.push(
          layer.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: M.reducedIn,
            easing: 'ease',
            fill: 'both',
          }),
        )
      } else {
        const bar = findBar(eventId)
        const rect = bar ? visibleRect(bar) : null
        if (bar && rect) {
          const morph = window.innerWidth < 768 ? M.morphPhone : M.morph

          // The layer starts as exactly the bar — its rectangle, its radius,
          // its tint — and grows to the viewport.
          anims.push(
            layer.animate([{ clipPath: insetFor(rect) }, { clipPath: FULL }], {
              duration: morph,
              easing: EASE_SWIPE,
              fill: 'both',
            }),
            layer.animate(
              [{ backgroundColor: tintOf(bar.dataset.eventColor) }, { backgroundColor: PAGE_BG }],
              { duration: M.morphFill, easing: 'ease', fill: 'both' },
            ),
          )

          // The timeline falls back, as if the camera pushed into the bar.
          if (root) {
            setPushOrigin(root, rect)
            root.style.willChange = 'transform, opacity'
            pushRef.current = root.animate(
              [{ transform: 'scale(1)' }, { transform: `scale(${M.pushScale})` }],
              { duration: morph, easing: EASE_SWIPE, fill: 'both' },
            )
            anims.push(
              pushRef.current,
              root.animate([{ opacity: 1 }, { opacity: 0 }], {
                duration: M.pushFade,
                easing: 'ease',
                fill: 'both',
              }),
            )
          }

          // Then the page settles into it: header, photos, content columns.
          let contentIndex = 0
          layer.querySelectorAll<HTMLElement>('[data-morph-stage]').forEach((el) => {
            const kind = el.dataset.morphStage
            const delay =
              kind === 'header'
                ? M.headerAt
                : kind === 'photo'
                  ? M.photoAt
                  : M.contentAt + M.contentStagger * contentIndex++
            const from =
              kind === 'photo'
                ? 'scale(0.96)'
                : `translateY(${kind === 'header' ? 14 : 30}px)`
            anims.push(
              el.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: M.stageFade,
                delay,
                easing: 'ease',
                fill: 'both',
              }),
              el.animate([{ transform: from }, { transform: 'none' }], {
                duration: M.stageRise,
                delay,
                easing: EASE_ENTER,
                fill: 'both',
              }),
            )
          })
        } else {
          // Nothing to grow from (keyboard with the bar off screen, or an
          // entry with no bar element): the page rises into place instead.
          anims.push(
            layer.animate(
              [
                { opacity: 0, transform: 'translateY(24px)' },
                { opacity: 1, transform: 'none' },
              ],
              { duration: M.fallback, easing: EASE_ENTER, fill: 'both' },
            ),
          )
        }
      }

      animsRef.current = anims
      Promise.all(anims.map((a) => a.finished))
        .then(() => {
          if (phaseRef.current !== 'opening') return
          phaseRef.current = 'open'
          if (root) root.style.willChange = ''
          // The root is invisible behind the page by now; drop its scale so it
          // stops overhanging the viewport. Close puts it back to animate from.
          pushRef.current?.cancel()
        })
        // Cancelled by a close or an unmount — nothing to do.
        .catch(() => {})
    },
    [layerRef, reset],
  )

  const close = useCallback(
    async (eventId: string) => {
      const layer = layerRef.current
      if (!layer || phaseRef.current === 'idle') {
        reset()
        return
      }
      if (phaseRef.current === 'closing') return
      const wasOpening = phaseRef.current === 'opening'
      phaseRef.current = 'closing'
      const run = ++runRef.current

      const root = document.getElementById('root')
      let closing: Animation[]

      if (wasOpening) {
        // Esc or Close mid-open: play the open backwards from where it is.
        animsRef.current.forEach((a) => a.reverse())
        closing = animsRef.current
      } else if (prefersReducedMotion()) {
        closing = [
          layer.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: M.reducedOut,
            easing: 'ease',
            fill: 'forwards',
          }),
        ]
      } else {
        // Undo the push first so the bar is measured at its real size. The
        // layer still covers the screen, so the jump is never seen.
        pushRef.current?.cancel()
        const bar = findBar(eventId)
        const rect = bar ? visibleRect(bar) : null
        closing = []

        layer.querySelectorAll<HTMLElement>('[data-morph-stage]').forEach((el) => {
          closing.push(
            el.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: M.closeFade,
              easing: 'ease',
              fill: 'forwards',
            }),
          )
        })

        if (bar && rect) {
          const delay = M.closeFade * 0.6
          closing.push(
            layer.animate([{ clipPath: FULL }, { clipPath: insetFor(rect) }], {
              duration: M.closeMorph,
              delay,
              easing: EASE_SWIPE,
              fill: 'forwards',
            }),
            // The tint comes back only in the last stretch, as the page is
            // nearly bar-sized again — earlier, it washes the whole screen.
            layer.animate(
              [{ backgroundColor: PAGE_BG }, { backgroundColor: tintOf(bar.dataset.eventColor) }],
              {
                duration: M.closeMorph * 0.5,
                delay: delay + M.closeMorph * 0.5,
                easing: 'ease',
                fill: 'forwards',
              },
            ),
            // Hand over to the real bar in the last frames.
            layer.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 120,
              delay: delay + M.closeMorph - 60,
              easing: 'ease',
              fill: 'forwards',
            }),
          )
          if (root) {
            setPushOrigin(root, rect)
            closing.push(
              root.animate([{ transform: `scale(${M.pushScale})` }, { transform: 'scale(1)' }], {
                duration: M.closeMorph,
                delay,
                easing: EASE_SWIPE,
                fill: 'forwards',
              }),
              root.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: M.closeMorph,
                delay,
                easing: 'ease',
                fill: 'forwards',
              }),
            )
          }
        } else {
          closing.push(
            layer.animate(
              [
                { opacity: 1, transform: 'none' },
                { opacity: 0, transform: 'translateY(24px)' },
              ],
              { duration: M.fallback * 0.7, easing: 'ease', fill: 'forwards' },
            ),
          )
          if (root) {
            closing.push(
              root.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: M.fallback * 0.7,
                easing: 'ease',
                fill: 'forwards',
              }),
            )
          }
        }
        animsRef.current = [...animsRef.current, ...closing]
      }

      await Promise.all(closing.map((a) => a.finished)).catch(() => {})
      // Reopened while this was closing: that open owns the layer now.
      if (runRef.current !== run) return
      // Hide the layer before the animations are cancelled. Cancelling drops
      // their `fill: forwards` end state, so the layer would snap back to its
      // own styles — the whole page, opaque, full-screen — for the frame or
      // two before React unmounts it: a flash of the event over the timeline
      // it has just shrunk back into.
      layer.style.visibility = 'hidden'
      reset()
    },
    [layerRef, reset],
  )

  return { open, close }
}

/** Return focus to the bar the page was opened from, if it is still there. */
export function focusEventBar(eventId: string) {
  findBar(eventId)?.focus({ preventScroll: true })
}
