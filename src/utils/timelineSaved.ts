/**
 * "A timeline's `updated_at` just moved" — a same-tab notification, so the side
 * panel can re-sort the moment a save lands.
 *
 * The signed-in twin of `DRAFTS_CHANGED_EVENT` in `draftStorage.ts`, and it
 * exists for the same reason that one gives: hanging the signal off the write
 * layer covers every caller wherever they're called from. Two of them cannot be
 * covered any other way — the flush `useAutosave` runs on unmount, and the
 * back-online retry that fires from a window listener. Both resolve after the
 * editor's last render, so a React context write-through (the shape
 * `activeTimelineTitle` and friends use) has no component left to push it.
 *
 * Why the panel must not simply lean on Supabase realtime: no migration in this
 * repo adds `public.timelines` to the `supabase_realtime` publication — it is
 * dashboard-only state. Where it is off, the realtime UPDATE handler in
 * `useTimelines` never fires, and a `CHANNEL_ERROR` is invisible whenever the
 * list is non-empty, so the order silently freezes while looking perfectly
 * normal. That was the bug. Realtime is now the cross-tab bonus it should always
 * have been, not the only thing holding the order up.
 *
 * Unlike the draft stores this carries a payload. They fire a bare `Event`
 * because their listeners re-read localStorage; there is no synchronous store to
 * re-read here, and the only alternative is a network refetch on every save.
 */
export const TIMELINE_SAVED_EVENT = 'timeline-academy:timeline-saved'

export interface TimelineSavedDetail {
  id: string
  /**
   * Exactly what the row now holds — read back from the write itself, not the
   * value the client hoped it wrote. Those differ the moment a database trigger
   * stamps `updated_at` server-side, and the panel has to sort on the real one.
   */
  updatedAt: string
}

export function notifyTimelineSaved(detail: TimelineSavedDetail): void {
  window.dispatchEvent(new CustomEvent<TimelineSavedDetail>(TIMELINE_SAVED_EVENT, { detail }))
}

/**
 * Returns its own unsubscribe, so it drops straight into a `useEffect` return.
 *
 * Wrapping the listener here keeps the `CustomEvent` cast in exactly one place:
 * `WindowEventMap` knows nothing about this event name, and the project builds
 * under strict mode with no unused locals.
 */
export function onTimelineSaved(handler: (detail: TimelineSavedDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<TimelineSavedDetail>).detail)
  window.addEventListener(TIMELINE_SAVED_EVENT, listener)
  return () => window.removeEventListener(TIMELINE_SAVED_EVENT, listener)
}
