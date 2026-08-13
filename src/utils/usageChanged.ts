/**
 * "The usage counts just moved" — a same-tab notification, so the Usage Limits
 * card can recount the moment a timeline is created, deleted or duplicated, or
 * a save changes how many events exist.
 *
 * The sibling of `TIMELINE_SAVED_EVENT` in `timelineSaved.ts`, and it exists
 * for the same reason: hanging the signal off the write layer covers every
 * caller wherever they're called from.
 *
 * Why the card must not simply lean on Supabase realtime — `useEventUsage`
 * subscribes to `postgres_changes` on both tables, and neither subscription can
 * carry a delete:
 *
 *   - The `timelines` channel filters on `user_id`, but under default replica
 *     identity a DELETE's `old` record carries only the primary key, so that
 *     filter never matches. `20260808000000_timeline_ordering.sql` says so, and
 *     handles the same problem in `useTimelines` by refetching explicitly at
 *     the delete sites.
 *   - No migration in this repo adds `public.events` to the
 *     `supabase_realtime` publication at all, so the cascade that removes a
 *     deleted timeline's events is invisible too.
 *
 * The result was a card that refreshed exactly once per page load: it is
 * rendered outside the router's `<Outlet/>`, in an `<aside>` that stays mounted
 * and hides by transform, so nothing short of a reload remounted the hook.
 * Realtime is the cross-tab bonus it should always have been.
 *
 * Payload-free, like `DRAFTS_CHANGED_EVENT` and unlike `TIMELINE_SAVED_EVENT`:
 * the only thing a listener can do here is recount, and the counts come from
 * the server rather than from anything a caller could hand over.
 */
export const USAGE_CHANGED_EVENT = 'timeline-academy:usage-changed'

export function notifyUsageChanged(): void {
  window.dispatchEvent(new Event(USAGE_CHANGED_EVENT))
}

/** Returns its own unsubscribe, so it drops straight into a `useEffect` return. */
export function onUsageChanged(handler: () => void): () => void {
  window.addEventListener(USAGE_CHANGED_EVENT, handler)
  return () => window.removeEventListener(USAGE_CHANGED_EVENT, handler)
}
