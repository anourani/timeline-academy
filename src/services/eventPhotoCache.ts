// Cache for the event view's photos.
//
// The photos are a couple of Wikipedia requests away and cost nothing to
// refetch, so they live here rather than in a column — no migration to
// forget to apply (docs/2026-11-24-event-view-prd.md §5, §14). Each entry
// records the plan it was looked up from (which subjects), so a description
// that later names different subjects looks again. Same shape and eviction
// as worldEventCache.ts.

import type { EventPhoto } from '@/types/event'

/** Every entry, any version — what eviction and sign-out sweep. */
const BASE_PREFIX = 'timeline_event_photos_'
/**
 * Bump when the selection rules in wikipediaPhotos.ts or wikipediaArticle.ts
 * change, so galleries chosen by the old rules are never shown again.
 *   v2: the article comes from the event's cited Wikipedia source, or a
 *       search result is accepted only if it is relevant — v1 trusted the top
 *       search hit and could cache a gallery from an unrelated article.
 *   v3: one photo per subject the event is about (the spouse in a marriage),
 *       never every image on a related article.
 *   v4: only subjects the event's title names, and never the timeline's own
 *       subject — v3 could cache the subject's portrait on any event.
 */
const PREFIX = `${BASE_PREFIX}v4_`

// Each entry is ≤ 3 URLs and captions, so this is well under 100 KB.
const MAX_ENTRIES = 150

interface CacheEntry {
  /** What the photos were chosen from; a change means looking again. */
  basis: string
  photos: EventPhoto[]
  savedAt: number
}

export interface CachedGallery {
  basis: string
  photos: EventPhoto[]
}

// Keyed by title as well as id: renaming an event should look its photos up
// again, since the title is the search.
function key(eventId: string, title: string): string {
  return `${PREFIX}${eventId}:${title.trim().toLowerCase()}`
}

function allCacheKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(BASE_PREFIX)) keys.push(k)
    }
  } catch {
    // ignore
  }
  return keys
}

function evictOldest(): void {
  try {
    const keys = allCacheKeys()
    if (keys.length <= MAX_ENTRIES) return
    const withAge = keys.map((k) => {
      let savedAt = 0
      try {
        savedAt = (JSON.parse(localStorage.getItem(k) ?? '{}') as CacheEntry).savedAt ?? 0
      } catch {
        // unparseable entries sort oldest and get evicted first
      }
      return { k, savedAt }
    })
    withAge.sort((a, b) => a.savedAt - b.savedAt)
    for (const { k } of withAge.slice(0, keys.length - MAX_ENTRIES)) {
      localStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
}

/**
 * The cached gallery and what it was chosen from, or null when there is
 * none. An empty `photos` is a real answer: nothing to show.
 */
export function getCachedEventPhotos(eventId: string, title: string): CachedGallery | null {
  try {
    const raw = localStorage.getItem(key(eventId, title))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (!Array.isArray(entry.photos)) return null
    return { basis: typeof entry.basis === 'string' ? entry.basis : '', photos: entry.photos }
  } catch {
    return null
  }
}

export function setCachedEventPhotos(
  eventId: string,
  title: string,
  basis: string,
  photos: EventPhoto[],
): void {
  try {
    const entry: CacheEntry = { basis, photos, savedAt: Date.now() }
    localStorage.setItem(key(eventId, title), JSON.stringify(entry))
    evictOldest()
  } catch {
    // ignore — quota / disabled storage
  }
}

/** Sign-out: what a person looked at stays with them, not with the device. */
export function clearAllEventPhotos(): void {
  try {
    for (const k of allCacheKeys()) localStorage.removeItem(k)
  } catch {
    // ignore
  }
}
