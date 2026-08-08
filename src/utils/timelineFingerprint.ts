import type { TimelineEvent, CategoryConfig } from '../types/event';

/**
 * Fingerprints for deciding whether a timeline actually changed.
 *
 * Autosave used to write unconditionally, so merely *opening* a timeline
 * rewrote its row — bumping `updated_at` and reshuffling the side panel, which
 * sorts on it. These fingerprints let the save paths compare "what's in the
 * editor" against "what the store already has" and skip the write when they
 * match.
 *
 * Deliberately an exact serialisation rather than a hash. A hash collision here
 * would silently drop a real save, which is a terrible payoff for saving a few
 * hundred bytes of memory — and there is no size problem to solve, since both
 * strings are already held in memory anyway.
 */

/**
 * Split in two so the common case is cheap. Typing in the title changes `meta`
 * on every keystroke while `events` stays byte-identical — and because the
 * events string is memoised on array identity, comparing it is a pointer
 * comparison rather than a memcmp over what can be a megabyte of JSON.
 */
export interface Fingerprint {
  meta: string;
  events: string;
}

interface MetaInput {
  id: string;
  title: string;
  description: string;
  scale: string;
  verticalScale: string;
  groupByCategory: boolean;
  /** Guest drafts persist categories; signed-in timelines do not. */
  categories?: CategoryConfig[];
}

/**
 * Everything the store actually persists, plus the id.
 *
 * The id matters: a user can keep typing while `loadTimeline` is in flight,
 * arming a save that carries the *outgoing* timeline's id. Scoping the
 * fingerprint by id means such a save can never be mistaken for the incoming
 * timeline's baseline.
 *
 * Serialised as a JSON array, not a template string — JSON escapes quotes and
 * control characters, so a title containing a delimiter can't forge a field
 * boundary, and array position sidesteps key-order questions. Inside an array
 * `undefined` also serialises to `null`, which is the normalisation we want.
 */
export function metaFingerprint(input: MetaInput): string {
  return JSON.stringify([
    input.id,
    input.title,
    input.description,
    input.scale,
    input.verticalScale,
    input.groupByCategory,
    input.categories
      ? input.categories.map(c => [c.id, c.label, c.color, c.visible])
      : null,
  ]);
}

/**
 * Builds an events fingerprinter with a one-slot cache keyed on array identity.
 *
 * Identity is a sound key here because nothing in this codebase mutates an
 * event array or an event object in place — every edit path builds new ones. So
 * a cache hit means the events genuinely did not change, and the expensive
 * stringify only runs on a real event mutation (add, drag, delete, table-editor
 * commit, enrichment) rather than per keystroke.
 *
 * Create one per hook instance rather than sharing a module-level cache, so the
 * signed-in and guest paths can't evict each other.
 */
export function createEventsFingerprint(): (events: TimelineEvent[]) => string {
  let lastArray: TimelineEvent[] | null = null;
  let lastResult = '';

  return (events: TimelineEvent[]): string => {
    if (events === lastArray) return lastResult;

    // Order-insensitive on purpose: nothing persists event order. The event
    // save is map/set based, there is no ordering column, and the timeline
    // renders by date. A fingerprint that changed on reorder would arm writes
    // that change nothing in the store — the exact bug this exists to prevent.
    // Plain code-unit compare, not localeCompare: these are UUIDs, and
    // localeCompare is an order of magnitude slower for no benefit.
    const sorted = [...events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // `?? null` mirrors the normalisation in saveEvents.ts, so an event created
    // in this session (fields undefined) fingerprints identically to the same
    // event after a reload from the store (fields null).
    lastResult = JSON.stringify(
      sorted.map(e => [
        e.id,
        e.title,
        e.startDate,
        e.endDate,
        e.category,
        e.description ?? null,
        e.imageUrl ?? null,
        e.imageAttribution ?? null,
        e.sources ? e.sources.map(s => [s.title, s.url]) : null,
      ]),
    );
    lastArray = events;
    return lastResult;
  };
}

/** A null baseline means "unknown" — always treat that as dirty. */
export function fingerprintsEqual(a: Fingerprint | null, b: Fingerprint): boolean {
  return a !== null && a.meta === b.meta && a.events === b.events;
}
