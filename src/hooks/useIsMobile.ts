import { useEffect, useState } from 'react'
import { PANEL_RESIZE_BREAKPOINT } from '@/constants/panels'

function isMobileViewport(): boolean {
  // Matches the SSR-safe read in `useIsNarrow.ts`: without a window, answer
  // with the layout the markup describes before any media query resolves.
  return typeof window === 'undefined' ? false : window.innerWidth < PANEL_RESIZE_BREAKPOINT
}

/**
 * Whether the viewport is below `md` — the breakpoint every side panel splits
 * at. Deliberately separate from `useIsNarrow` (`sm`), which is about the
 * modals' rails and says so.
 *
 * Layout still belongs in `md:` prefixes; this exists only for picking a
 * component tree, which a media query cannot do: `CategoryLegend` mounts a
 * Popover or a full-screen Dialog, and that is not a class.
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(isMobileViewport)

  useEffect(() => {
    // The exact complement of Tailwind's `md` (`min-width: 768px`), so the
    // tree swap and the `md:` classes can never disagree at the boundary.
    const query = window.matchMedia(`(max-width: ${PANEL_RESIZE_BREAKPOINT - 0.02}px)`)
    const sync = () => setMobile(query.matches)
    // Re-read on mount as well as on change: the initial `useState` ran during
    // the first render, and a resize between then and this effect would
    // otherwise be missed until the next one.
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return mobile
}
