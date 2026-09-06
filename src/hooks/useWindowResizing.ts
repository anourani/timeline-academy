import { useSyncExternalStore } from 'react'

/**
 * True while the browser window is mid-resize.
 *
 * Panels already drop their 300ms width/transform easing while their own resize
 * handle is dragged (`isResizing` in `SidePanelContext` and `usePanelWidth`'s
 * callers) — otherwise the panel edge eases along behind the cursor instead of
 * tracking it. Dragging the *window* changes the same widths, via the viewport
 * clamp in `clampPanelWidth`, and had no equivalent escape hatch: below the
 * `md` breakpoint the clamp binds, the width changes every frame, and each
 * change restarts a 300ms transition that never gets to finish. The layout
 * crawls during the drag and lands a third of a second after it ends.
 *
 * One module-level listener rather than one per consumer, read through
 * `useSyncExternalStore`, so every panel flips in the same commit instead of
 * drifting a frame apart.
 */

/** How long after the last resize event the window counts as settled. */
const SETTLE_MS = 150

let resizing = false
let settleTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function handleResize() {
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    resizing = false
    emit()
  }, SETTLE_MS)

  // Only notify on the leading edge. The trailing timer is rescheduled on every
  // event, but re-rendering every consumer each frame to set a boolean that is
  // already `true` is exactly the per-frame work this hook exists to avoid.
  if (resizing) return
  resizing = true
  emit()
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('resize', handleResize)
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    window.removeEventListener('resize', handleResize)
    clearTimeout(settleTimer)
    settleTimer = undefined
    // The next subscriber starts from a settled window rather than inheriting a
    // `true` stranded by the last unmount mid-drag.
    resizing = false
  }
}

function getSnapshot(): boolean {
  return resizing
}

/** Server/prerender: nothing is being dragged. */
function getServerSnapshot(): boolean {
  return false
}

export function useWindowResizing(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
