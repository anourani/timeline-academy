import { TimelineEvent } from '../types/event';
import { Month } from '../types/timeline';
import { format } from 'date-fns';

// Year 1 rather than 1900: the app charts history, and a 1900 floor silently
// pulled every earlier event off the rendered grid. AD only — `YYYY-MM-DD`
// strings and the `split('-')` parsing below cannot express a negative year.
const MIN_YEAR = 1;
const MAX_YEAR = 2100;
const DEFAULT_START_YEAR = 2014;
const DEFAULT_END_YEAR = 2024;

export interface DateParts {
  year: number;
  /** 0-indexed, matching `Month.month`. */
  month: number;
  day: number;
}

/**
 * Calendar parts of a `YYYY-MM-DD` string, read without going through `Date`.
 *
 * `new Date('1900-01-01')` parses as UTC midnight but `getFullYear()` reads back
 * in local time, so anywhere west of UTC a January-1st date reports the
 * *previous* year. The generator is told "year-only -> January 1", so that hit
 * a large share of AI events and is what made the header read `1596-1899` for a
 * timeline whose last date is 1900-01-01.
 *
 * Returns null for anything unparseable, so callers can skip the event rather
 * than propagate a NaN through `Math.min`/`Math.max`.
 */
export function parseDateParts(dateStr: string): DateParts | null {
  if (!dateStr) return null;

  const match = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(dateStr.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month: month - 1, day };
}

/**
 * Build a `YYYY-MM-DD` string from calendar parts (`month` 0-indexed).
 *
 * The year is padded to four digits: `isValidDateFormat` requires `\d{4}`, and
 * `new Date('596-01-01T00:00:00')` is Invalid Date while `'0596-01-01T00:00:00'`
 * parses correctly.
 */
export function formatYMD(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Index of the month containing `dateStr` within `months`, clamped to the
 * nearest edge when the date falls outside the rendered range.
 *
 * Returns -1 only when there are no months or the date is unparseable. Callers
 * must never turn that into a CSS grid line: a negative grid line counts from
 * the *end* of the grid, which is what stacked every off-grid event onto the
 * timeline's right edge.
 */
export function findMonthIndex(months: Month[], dateStr: string): number {
  if (!months.length) return -1;

  const parts = parseDateParts(dateStr);
  if (!parts) return -1;

  const index = months.findIndex(
    m => m.year === parts.year && m.month === parts.month
  );
  if (index !== -1) return index;

  const first = months[0];
  const beforeStart =
    parts.year < first.year ||
    (parts.year === first.year && parts.month < first.month);

  return beforeStart ? 0 : months.length - 1;
}

function calculateTimelineRange(events: TimelineEvent[]) {
  const years = events
    .flatMap(event => [event.startDate, event.endDate])
    .map(parseDateParts)
    .filter((parts): parts is DateParts => parts !== null)
    .map(parts => parts.year);

  // Also covers an empty timeline and one whose dates are all malformed.
  if (years.length === 0) {
    return {
      startYear: DEFAULT_START_YEAR,
      endYear: DEFAULT_END_YEAR
    };
  }

  let startYear = Math.max(MIN_YEAR, Math.min(...years));
  let endYear = Math.min(MAX_YEAR, Math.max(...years));

  // Ensure we always show at least 10 years
  if (endYear - startYear < 9) {
    const midYear = Math.floor((startYear + endYear) / 2);
    startYear = Math.max(MIN_YEAR, midYear - 5);
    endYear = Math.min(MAX_YEAR, midYear + 5);
  }

  // Add 3-year scroll padding beyond event range
  startYear = Math.max(MIN_YEAR, startYear - 3);
  endYear = Math.min(MAX_YEAR, endYear + 3);

  return { startYear, endYear };
}

function generateMonthsRange(startYear: number, endYear: number): Month[] {
  const months: Month[] = [];

  for (let year = startYear; year <= endYear; year++) {
    for (let month = 0; month < 12; month++) {
      months.push({ year, month });
    }
  }

  return months;
}

// Timeline range utilities
export function getTimelineRange(events: TimelineEvent[]) {
  const { startYear, endYear } = calculateTimelineRange(events);

  return { months: generateMonthsRange(startYear, endYear) };
}

// Date parsing and formatting utilities
export function normalizeDate(dateStr: string): string | null {
  // Remove any surrounding whitespace
  dateStr = dateStr.trim();
  
  // Try M(M)/D(D)/YYYY format
  const dateFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateStr.match(dateFormat);
  if (match) {
    const [, month, day, year] = match;
    const m = parseInt(month);
    const d = parseInt(day);
    const y = parseInt(year);
    
    // Basic date validation
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < MIN_YEAR) {
      return null;
    }
    
    // Format as YYYY-MM-DD
    return formatYMD(y, m - 1, d);
  }

  return null;
}

export function isValidDateFormat(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

export function formatDateForCSV(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${month}/${day}/${year}`;
}

// Date picker conversion helpers (shared by EventForm and EventTableEditor)
export const parseDate = (dateStr: string): Date | undefined => {
  if (!dateStr) return undefined
  return new Date(dateStr + 'T00:00:00')
}

export const formatDateToString = (date: Date): string => {
  return format(date, 'yyyy-MM-dd')
}

export const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return ''
  const date = parseDate(dateStr)
  if (!date) return ''
  return format(date, 'MM/dd/yyyy')
}

// Long-form date for the event detail panel header. e.g. "Jun 12, 1943".
export const formatDateLong = (dateStr: string): string => {
  if (!dateStr) return ''
  const date = parseDate(dateStr)
  if (!date) return ''
  return format(date, 'MMM d, yyyy')
}

// Dark theme classNames for Calendar component
export const darkCalendarClassNames = {
  day_selected: "bg-[rgba(37,99,235,0.8)] text-white hover:bg-[rgba(37,99,235,0.9)] focus:bg-[rgba(37,99,235,0.9)]",
  day_today: "ring-1 ring-[#9b9ea3] text-[#c9ced4]",
  day: "h-8 w-8 p-0 font-normal text-[#c9ced4] hover:bg-[#151617] rounded-md inline-flex items-center justify-center aria-selected:opacity-100",
  head_cell: "text-[#9b9ea3] w-8 font-normal text-[0.8rem]",
  caption_label: "text-[#c9ced4] text-sm font-medium",
  nav_button: "h-7 w-7 bg-transparent hover:bg-[#151617] rounded-md p-0 opacity-70 hover:opacity-100 inline-flex items-center justify-center border border-[rgba(210,210,210,0.2)]",
  cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-[rgba(37,99,235,0.2)] [&:has([aria-selected])]:rounded-md",
  day_outside: "text-[#6b6e73] opacity-50 aria-selected:opacity-100",
  day_disabled: "text-[#6b6e73] opacity-30",
}

// Drag-and-drop date shifting utilities

export function shiftEventDates(
  event: { startDate: string; endDate: string },
  deltaQuarters: number,
): { startDate: string; endDate: string } {
  if (deltaQuarters === 0) {
    return { startDate: event.startDate, endDate: event.endDate };
  }

  // Use addDays to shift dates directly, preserving exact duration.
  // Each quarter-column represents ~7 days (month split into 4 parts).
  const daysDelta = deltaQuarters * 7;
  const start = new Date(event.startDate + 'T00:00:00');
  const end = new Date(event.endDate + 'T00:00:00');

  start.setDate(start.getDate() + daysDelta);
  end.setDate(end.getDate() + daysDelta);

  const fmt = (d: Date) => formatYMD(d.getFullYear(), d.getMonth(), d.getDate());

  return { startDate: fmt(start), endDate: fmt(end) };
}