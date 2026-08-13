import { useEffect, useState } from 'react'

/**
 * Tailwind's `sm` breakpoint, in px. The modals' rails collapse to horizontal
 * tab strips below it — a 200px rail plus ~320px of content plus padding needs
 * roughly 570px, so this is where the vertical layout stops fitting.
 *
 * Deliberately not `PANEL_RESIZE_BREAKPOINT` (768): that governs the side
 * panel's resize handles, which is a different question about a different
 * element.
 */
export const NARROW_BREAKPOINT = 640

function isNarrowViewport(): boolean {
  // Matches the SSR-safe read in `usePanelWidth.ts`. Answering "not narrow"
  // without a window is the right default: it is the layout the markup
  // describes before any media query resolves.
  return typeof window === 'undefined' ? false : window.innerWidth < NARROW_BREAKPOINT
}

/**
 * Whether the viewport is below `sm`.
 *
 * Layout should use Tailwind's `sm:` prefix instead of this — CSS handles a
 * breakpoint without a render pass. This exists for the cases a media query
 * cannot reach, which in practice means props: `EventTableEditor` picks a
 * dnd-kit sorting strategy and a set of drag modifiers per orientation, and
 * those are JavaScript values, not classes.
 */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(isNarrowViewport)

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 0.02}px)`)
    const sync = () => setNarrow(query.matches)
    // Re-read on mount as well as on change: the initial `useState` ran during
    // the first render, and a resize between then and this effect would
    // otherwise be missed until the next one.
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return narrow
}
