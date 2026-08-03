// Per-event AI enrichment cache for public viewers of /view/:id timelines.
//
// Public viewers don't own the timeline row, so generations they trigger with
// their own BYOK key (or via the server path) can't be persisted to Supabase.
// Instead we stash the four enrichment fields in localStorage keyed by
// <timelineId>:<eventId>. Owner-generated content from the DB always wins —
// this cache is only the fallback when the row has nothing.

import type { EventSource } from '../types/event'

const PREFIX = 'timeline_viewer_event_'

export interface CachedEnrichment {
  description?: string | null
  imageUrl?: string | null
  imageAttribution?: string | null
  sources?: EventSource[] | null
  /** Written on save; used to evict the oldest entries when the cache grows. */
  savedAt?: number
}

// Without a cap this cache becomes a permanent local record of every shared
// timeline the user has ever opened. Oldest entries are evicted past this.
const MAX_ENTRIES = 200

function key(timelineId: string, eventId: string): string {
  return `${PREFIX}${timelineId}:${eventId}`
}

function allCacheKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
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
        savedAt = (JSON.parse(localStorage.getItem(k) ?? '{}') as CachedEnrichment).savedAt ?? 0
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

export function getCachedEvent(
  timelineId: string,
  eventId: string,
): CachedEnrichment | null {
  try {
    const raw = localStorage.getItem(key(timelineId, eventId))
    if (!raw) return null
    return JSON.parse(raw) as CachedEnrichment
  } catch {
    return null
  }
}

export function setCachedEvent(
  timelineId: string,
  eventId: string,
  value: CachedEnrichment,
): void {
  try {
    localStorage.setItem(
      key(timelineId, eventId),
      JSON.stringify({ ...value, savedAt: Date.now() }),
    )
    evictOldest()
  } catch {
    // ignore — quota / disabled storage
  }
}

export function clearCachedEvent(
  timelineId: string,
  eventId: string,
): void {
  try {
    localStorage.removeItem(key(timelineId, eventId))
  } catch {
    // ignore
  }
}

export function clearAllCachedEvents(): void {
  try {
    for (const k of allCacheKeys()) {
      localStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
}
