import { useEffect, useRef, useState } from 'react'

/** Normal cadence — slow enough to read each arrival as a separate event. */
const RELEASE_MS = 200
/** Used once the backlog is deep enough that the normal cadence would fall
 *  visibly behind the stream. */
const DRAIN_MS = 60
const DRAIN_THRESHOLD = 6

/**
 * Paces a growing array so its tail appears one item at a time.
 *
 * A stream does not arrive evenly: a provider sends several NDJSON lines in
 * one chunk, so without pacing six events pop into the canvas together and
 * then nothing happens for two seconds. Releasing on a fixed cadence turns
 * the same data into a steady fill.
 *
 * It also bounds a real cost. `calculateEventStacks` re-runs on every change
 * to the events array, is O(n·m) in month scans, and runs once per category
 * in grouped mode — so this interval, not the provider's chunking, is what
 * caps how often that happens.
 *
 * Returns `items` itself once everything is released, so the identity the
 * downstream layout memo depends on is preserved.
 */
export function useRevealQueue<T>(items: T[], enabled: boolean): T[] {
  const [shown, setShown] = useState(0)

  // Both counts live in refs as well as state. The timer reschedules itself
  // from inside its own callback, where React's state has not committed yet
  // — deciding the next delay from `shown` directly would read a value one
  // tick behind and never reach the fast cadence.
  const shownRef = useRef(0)
  const totalRef = useRef(0)
  totalRef.current = items.length

  useEffect(() => {
    if (!enabled) {
      shownRef.current = 0
      setShown(0)
      return
    }

    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const remaining = totalRef.current - shownRef.current
      if (remaining > 0) {
        shownRef.current += 1
        setShown(shownRef.current)
      }
      // Recomputed after the release, so a deep backlog speeds up on the
      // very next interval rather than one behind.
      const left = totalRef.current - shownRef.current
      timer = setTimeout(tick, left > DRAIN_THRESHOLD ? DRAIN_MS : RELEASE_MS)
    }

    timer = setTimeout(tick, RELEASE_MS)
    return () => clearTimeout(timer)
  }, [enabled])

  // Off means the timeline has been committed: the array is the real one, not
  // a stream in progress, and holding any of it back would hide real content.
  if (!enabled) return items
  return shown >= items.length ? items : items.slice(0, shown)
}
