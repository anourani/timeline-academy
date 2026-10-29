// Results cache for the World Events lane.
//
// Every World Events fetch is an AI call that counts against a daily limit (or
// bills the user's own key), and the Design menu's chips are meant to feel
// instant. So each (timeline, source, country, year range) result is kept in
// localStorage, the same way viewerEventCache keeps enrichments: toggling a
// chip off and on again, reloading, or reopening the timeline costs nothing
// after the first fetch. Enrichments of these events (opened in the detail
// panel) are written back into the same entry.

import type { WorldEvent, WorldEventSource } from '@/types/worldEvents'

const PREFIX = 'timeline_world_events_'

// Each entry is one source's list (≤ 30 events), so this bounds the cache to
// a few hundred kilobytes.
const MAX_ENTRIES = 60

export interface WorldEventsCacheKey {
  timelineId: string
  source: WorldEventSource
  /** Only part of the key for the country source. */
  country: string
  startYear: number
  endYear: number
}

interface CacheEntry {
  events: WorldEvent[]
  savedAt: number
}

function key(k: WorldEventsCacheKey): string {
  const country = k.source === 'country' ? k.country : '-'
  return `${PREFIX}${k.timelineId}:${k.source}:${country}:${k.startYear}-${k.endYear}`
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

export function getCachedWorldEvents(k: WorldEventsCacheKey): WorldEvent[] | null {
  try {
    const raw = localStorage.getItem(key(k))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    return Array.isArray(entry.events) ? entry.events : null
  } catch {
    return null
  }
}

export function setCachedWorldEvents(k: WorldEventsCacheKey, events: WorldEvent[]): void {
  try {
    localStorage.setItem(key(k), JSON.stringify({ events, savedAt: Date.now() }))
    evictOldest()
  } catch {
    // ignore — quota / disabled storage
  }
}

/** Replace one event (by id) in whichever cached list holds it. */
export function updateCachedWorldEvent(timelineId: string, updated: WorldEvent): void {
  try {
    const prefix = `${PREFIX}${timelineId}:${updated.source}:`
    for (const k of allCacheKeys()) {
      if (!k.startsWith(prefix)) continue
      const entry = JSON.parse(localStorage.getItem(k) ?? '{}') as CacheEntry
      if (!Array.isArray(entry.events) || !entry.events.some((e) => e.id === updated.id)) continue
      entry.events = entry.events.map((e) => (e.id === updated.id ? updated : e))
      localStorage.setItem(k, JSON.stringify(entry))
    }
  } catch {
    // ignore
  }
}

export function clearAllWorldEvents(): void {
  try {
    for (const k of allCacheKeys()) {
      localStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
}
