// Gallery cache for the event view's photos.
//
// Only the lead photo is persisted with the event (`imageUrl` /
// `imageAttribution`, as before). The rest of the gallery is a few Wikipedia
// requests away and costs nothing to refetch, so it lives here rather than in
// a new column — no migration to forget to apply
// (docs/2026-11-24-event-view-prd.md §5). Same shape and eviction as
// worldEventCache.ts.

import type { EventPhoto } from '@/types/event'

/** Every entry, any version — what eviction and sign-out sweep. */
const BASE_PREFIX = 'timeline_event_photos_'
/**
 * Bump when the selection rules in wikipediaPhotos.ts or wikipediaArticle.ts
 * change, so galleries chosen by the old rules are never shown again.
 *   v2: the article comes from the event's cited Wikipedia source, or a
 *       search result is accepted only if it is relevant — v1 trusted the top
 *       search hit and could cache a gallery from an unrelated article.
 */
const PREFIX = `${BASE_PREFIX}v2_`

// Each entry is ≤ 6 URLs and captions, so this is well under 200 KB.
const MAX_ENTRIES = 150

interface CacheEntry {
  /** The article the photos came from; null when no relevant one was found. */
  article: string | null
  photos: EventPhoto[]
  savedAt: number
}

export interface CachedGallery {
  article: string | null
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
 * The cached gallery and the article it came from, or null when there is
 * none. An empty `photos` is a real answer: no relevant photos.
 */
export function getCachedEventPhotos(eventId: string, title: string): CachedGallery | null {
  try {
    const raw = localStorage.getItem(key(eventId, title))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (!Array.isArray(entry.photos)) return null
    return { article: typeof entry.article === 'string' ? entry.article : null, photos: entry.photos }
  } catch {
    return null
  }
}

export function setCachedEventPhotos(
  eventId: string,
  title: string,
  article: string | null,
  photos: EventPhoto[],
): void {
  try {
    const entry: CacheEntry = { article, photos, savedAt: Date.now() }
    localStorage.setItem(key(eventId, title), JSON.stringify(entry))
    evictOldest()
  } catch {
    // ignore — quota / disabled storage
  }
}

/** Remove clears an event's details; its gallery goes with them. */
export function clearCachedEventPhotos(eventId: string): void {
  try {
    for (const k of allCacheKeys()) {
      if (k.startsWith(`${PREFIX}${eventId}:`)) localStorage.removeItem(k)
    }
  } catch {
    // ignore
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
