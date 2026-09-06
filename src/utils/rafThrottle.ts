/**
 * Coalesce a burst of calls into one per animation frame.
 *
 * The counterpart to `debounce` for handlers that must keep firing *during* a
 * gesture rather than settle after it. A trailing debounce is the wrong shape
 * for resize: the browser emits an event every frame, so a wait short enough to
 * feel live is also short enough for the next event to clear the timer, and the
 * handler runs only once the user lets go.
 *
 * No arguments are captured — the handlers this exists for read the DOM
 * themselves, and a snapshot taken a frame ago would be the stale value we are
 * trying to avoid.
 */
export function rafThrottle(fn: () => void): { (): void; cancel: () => void } {
  let frame: number | undefined

  function throttled() {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      fn()
    })
  }

  throttled.cancel = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }

  return throttled
}
