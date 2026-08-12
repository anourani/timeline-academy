import { useCallback, useEffect, useState } from 'react'
import { clampPanelWidth } from '@/constants/panels'

/**
 * A panel's user-chosen width, persisted per device.
 *
 * Mirrors the storage shape `SidePanelContext` uses for `side_panel_open`:
 * lazy `useState` initializer reading localStorage, a `useEffect` writing it
 * back, both wrapped in try/catch so a disabled or full store degrades to
 * in-memory state rather than throwing.
 */

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

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width))
    } catch {
      // storage full or disabled — silently ignore
    }
  }, [storageKey, width])

  const setWidth = useCallback((next: number) => {
    setWidthState(clampPanelWidth(next, currentViewportWidth()))
  }, [])

  const resetWidth = useCallback(() => {
    setWidthState(clampPanelWidth(defaultWidth, currentViewportWidth()))
  }, [defaultWidth])

  // A window shrinking below the stored width would leave the panel wider than
  // its viewport — re-clamp on resize rather than waiting for the next drag.
  useEffect(() => {
    const handleResize = () => {
      setWidthState(prev => clampPanelWidth(prev, currentViewportWidth()))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return { width, setWidth, resetWidth }
}
