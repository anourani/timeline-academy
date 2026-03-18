import { TimelineEvent } from '../types/event';
import { Month } from '../types/timeline';

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DEFAULT_START_YEAR = 2014;
const DEFAULT_END_YEAR = 2024;

function calculateTimelineRange(events: TimelineEvent[]) {
  if (events.length === 0) {
    return {
      startYear: DEFAULT_START_YEAR,
      endYear: DEFAULT_END_YEAR
    };
  }

  const dates = events.flatMap(event => [
    new Date(event.startDate),
    new Date(event.endDate)
  ]);

  let startYear = Math.max(
    MIN_YEAR,
    Math.min(...dates.map(d => d.getFullYear()))
  );

  let endYear = Math.min(
    MAX_YEAR,
    Math.max(...dates.map(d => d.getFullYear()))
  );

  // Ensure we always show at least 10 years
  if (endYear - startYear < 9) {
    const midYear = Math.floor((startYear + endYear) / 2);
    startYear = Math.max(MIN_YEAR, midYear - 5);
    endYear = Math.min(MAX_YEAR, midYear + 5);
  }

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
  const months = generateMonthsRange(startYear, endYear);

  const startDate = new Date(startYear, 0, 1);
  const endDate = new Date(endYear, 11, 31);

  return { startDate, endDate, months };
}

// Date parsing and formatting utilities
export function normalizeDate(dateStr: string): string | null {
  // Remove any surrounding whitespace
  dateStr = dateStr.trim();
  
  // Try M(M)/D(D)/YYYY format
  const dateFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateStr.match(dateFormat);
  if (match) {
    const [_, month, day, year] = match;
    const m = parseInt(month);
    const d = parseInt(day);
    const y = parseInt(year);
    
    // Basic date validation
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) {
      return null;
    }
    
    // Format as YYYY-MM-DD
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return { startDate: fmt(start), endDate: fmt(end) };
}