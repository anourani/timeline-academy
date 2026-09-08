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
