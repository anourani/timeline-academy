import type { TimelineEvent } from '@/types/event'

/**
 * Where a World Events entry comes from. Order matters: it is the order the
 * Design menu's chips render in and the order the lane merges sources.
 */
export type WorldEventSource = 'country' | 'world' | 'science'

export const WORLD_EVENT_SOURCES: readonly WorldEventSource[] = ['country', 'world', 'science']

/** The per-timeline settings behind the World Events lane. */
export interface WorldEventSettings {
  showWorldEvents: boolean
  worldEventSources: WorldEventSource[]
  /** ISO 3166-1 alpha-2, upper case. */
  worldEventCountry: string
}

export const DEFAULT_WORLD_EVENT_SETTINGS: WorldEventSettings = {
  showWorldEvents: false,
  worldEventSources: ['world'],
  worldEventCountry: 'US',
}

/**
 * A read-only context event in the World Events lane: a timeline event with
 * no category (it belongs to no lane the user owns) and a source instead.
 *
 * Its id always starts `we:` — that prefix is how the detail panel's
 * write-back tells one apart from a real event, and it can never collide with
 * a real event's UUID.
 */
export type WorldEvent = Omit<TimelineEvent, 'category'> & {
  source: WorldEventSource
  /** ISO alpha-2, on country-source entries only — it is their lane tag. */
  country?: string
}

export type WorldEventsStatus = 'idle' | 'loading' | 'ready' | 'error'

export function isWorldEventId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith('we:')
}

/**
 * Coerce whatever a store hands back into valid settings. Every reader goes
 * through this — the columns may not exist yet (migrations are applied by
 * hand), and drafts saved before this feature carry none of the fields.
 */
export function normalizeWorldEventSettings(raw: {
  showWorldEvents?: unknown
  worldEventSources?: unknown
  worldEventCountry?: unknown
}): WorldEventSettings {
  const sources = Array.isArray(raw.worldEventSources)
    ? WORLD_EVENT_SOURCES.filter((s) => (raw.worldEventSources as unknown[]).includes(s))
    : []
  const country =
    typeof raw.worldEventCountry === 'string' && /^[A-Za-z]{2}$/.test(raw.worldEventCountry)
      ? raw.worldEventCountry.toUpperCase()
      : DEFAULT_WORLD_EVENT_SETTINGS.worldEventCountry
  return {
    showWorldEvents: raw.showWorldEvents === true,
    worldEventSources: sources.length > 0 ? sources : [...DEFAULT_WORLD_EVENT_SETTINGS.worldEventSources],
    worldEventCountry: country,
  }
}
