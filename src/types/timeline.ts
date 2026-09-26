export interface Month {
  year: number;
  month: number;
}

export interface Timeline {
  id: string;
  title: string;
  updated_at: string | null;
  user_id: string;
  scale: 'large' | 'medium' | 'small';
  verticalScale: 'small' | 'medium';
}

export interface TimelineScale {
  value: 'large' | 'medium' | 'small';
  monthWidth: number;
  quarterWidth: number;
}

export interface TimelineVerticalScale {
  value: 'small' | 'medium';
  eventHeight: number;
  eventRowHeight: number;
}

/**
 * A request to scroll the canvas to a date.
 *
 * A bare string centres that month, which is what bulk-add and the
 * first-event jump after a generation have always wanted. The object form
 * parks the date at the left edge instead, for jumping to the head of a
 * chapter: centring there would fill half the viewport with the chapter you
 * just left, and you want to be looking at the one you picked.
 */
export type ScrollTarget = string | { date: string; align: 'start' };

/**
 * A named span of a timeline — "Sputnik Shock", "Race to the Moon".
 *
 * Generated alongside the events by the AI pass and persisted as JSONB on
 * `timelines.chapters`. Chapters are contiguous and cover the whole event
 * span, so exactly one contains any given month.
 *
 * Deliberately carries no event count. A stored count is wrong the moment the
 * user adds or deletes an event, and counting the events in a range at render
 * time is cheap.
 */
export interface TimelineChapter {
  id: string;
  label: string;
  /** ISO date, normalised to the first of the month. */
  startDate: string;
  endDate: string;
}

/**
 * Where a timeline's events came from.
 *
 * `'ai'` is the only state that locks editing. The point is not to stop a
 * determined user — they own the row, and RLS lets them write to it through
 * the API directly — but to make sure a timeline still presenting itself as
 * raw AI output actually is one. Editing is therefore never blocked outright:
 * the user can unlock, and unlocking spends the `'ai'` label permanently by
 * moving the timeline to `'edited'`.
 *
 * Anything created before this field existed reads back as `'manual'`, which
 * is the honest answer — we have no record either way, and locking a
 * timeline someone has been editing for months would be the worse guess.
 */
export type TimelineOrigin = 'manual' | 'ai' | 'edited';

/** The two states in which the user may change events. */
export function canEditEvents(origin: TimelineOrigin): boolean {
  return origin !== 'ai';
}
