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
}

function key(timelineId: string, eventId: string): string {
  return `${PREFIX}${timelineId}:${eventId}`
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
    localStorage.setItem(key(timelineId, eventId), JSON.stringify(value))
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
