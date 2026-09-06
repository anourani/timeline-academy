import { useCallback, useEffect, useRef, useState } from 'react'
import { clampPanelWidth } from '@/constants/panels'
import { debounce } from '@/utils/debounce'
import { rafThrottle } from '@/utils/rafThrottle'

/**
 * A panel's user-chosen width, persisted per device.
 *
 * Mirrors the storage shape `SidePanelContext` uses for `side_panel_open`:
 * lazy `useState` initializer reading localStorage, a `useEffect` writing it
 * back, both wrapped in try/catch so a disabled or full store degrades to
 * in-memory state rather than throwing.
 */

/**
 * How long after the last width change the value is written to storage. Long
 * enough to cover a resize drag, short enough that a normal drag-and-release
 * has persisted before anything else can read it back.
 */
const PERSIST_DELAY_MS = 200

/**
 * The debounced writer, built outside the hook so its type can be named by the
 * ref that holds it. Reads the live value at fire time rather than capturing
 * one, so a burst of width changes persists the last of them, not the first.
 */
function createWidthPersister(read: () => { storageKey: string; width: number }) {
  return debounce(() => {
    const { storageKey, width } = read()
    try {
      localStorage.setItem(storageKey, String(width))
    } catch {
      // storage full or disabled — silently ignore
    }
  }, PERSIST_DELAY_MS)
}

function currentViewportWidth(): number {
  return typeof window === 'undefined' ? Infinity : window.innerWidth
}

function readStoredWidth(storageKey: string, fallback: number): number {
  const viewport = currentViewportWidth()
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return clampPanelWidth(fallback, viewport)
    const parsed = Number(raw)
    // A hand-edited or corrupt value must not propagate NaN into a width style
    // and collapse the layout — fall back to the default instead.
    if (!Number.isFinite(parsed)) return clampPanelWidth(fallback, viewport)
    return clampPanelWidth(parsed, viewport)
  } catch {
    return clampPanelWidth(fallback, viewport)
  }
}

export function usePanelWidth(storageKey: string, defaultWidth: number) {
  const [width, setWidthState] = useState(() => readStoredWidth(storageKey, defaultWidth))

  // Written once the width settles rather than on every change. Below the
  // breakpoint the viewport clamp binds, so a window drag moves `width` every
  // frame — and three panels mount this hook at once on the editor, which
  // turned one drag into three synchronous storage writes per frame on the
  // main thread. Only the width the user lands on is worth keeping.
  const latestRef = useRef({ storageKey, width })
  latestRef.current = { storageKey, width }

  const persistRef = useRef<ReturnType<typeof createWidthPersister> | null>(null)
  if (persistRef.current === null) {
    persistRef.current = createWidthPersister(() => latestRef.current)
  }

  useEffect(() => {
    persistRef.current?.()
  }, [storageKey, width])

  // Flush rather than cancel — a pending write holds the width the user just
  // chose, and unmounting a panel a moment after resizing it must not throw
  // that away. Same reasoning as `debounce`'s own doc comment.
  useEffect(() => {
    const persist = persistRef.current
    return () => persist?.flush()
  }, [])

  const setWidth = useCallback((next: number) => {
    setWidthState(clampPanelWidth(next, currentViewportWidth()))
  }, [])

  const resetWidth = useCallback(() => {
    setWidthState(clampPanelWidth(defaultWidth, currentViewportWidth()))
  }, [defaultWidth])

  // A window shrinking below the stored width would leave the panel wider than
  // its viewport — re-clamp on resize rather than waiting for the next drag.
  useEffect(() => {
    // Coalesced to one update per frame. The clamp is a no-op above the
    // breakpoint — `clampPanelWidth` ignores the viewport there, so the
    // functional update returns the same number and React skips the render.
    const handleResize = rafThrottle(() => {
      setWidthState(prev => clampPanelWidth(prev, currentViewportWidth()))
    })
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      handleResize.cancel()
    }
  }, [])

  return { width, setWidth, resetWidth }
}
