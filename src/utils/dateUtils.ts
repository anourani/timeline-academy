import { Month } from '../types/timeline';
import { TimelineEvent } from '../types/event';
import { calculateTimelineRange, generateMonthsRange } from './timelineRange';

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

function getQuarter(day: number): number {
  return Math.floor((day - 1) / 8);
}

function columnToDate(column: number, months: Month[]): string {
  const monthIndex = Math.max(0, Math.min(Math.floor(column / 4), months.length - 1));
  const quarter = Math.max(0, column - monthIndex * 4);
  const month = months[monthIndex];

  // Quarter to day: 0→1, 1→9, 2→17, 3→25
  const day = Math.min(quarter, 3) * 8 + 1;
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const clampedDay = Math.max(1, Math.min(day, daysInMonth));

  const mm = String(month.month + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${month.year}-${mm}-${dd}`;
}

export function shiftEventDates(
  event: { startDate: string; endDate: string },
  deltaQuarters: number,
  months: Month[]
): { startDate: string; endDate: string } {
  const [startYear, startMonth, startDay] = event.startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = event.endDate.split('-').map(Number);

  const startMonthIndex = months.findIndex(
    m => m.year === startYear && m.month === startMonth - 1
  );
  const endMonthIndex = months.findIndex(
    m => m.year === endYear && m.month === endMonth - 1
  );

  if (startMonthIndex === -1 || endMonthIndex === -1) {
    return { startDate: event.startDate, endDate: event.endDate };
  }

  const startColumn = startMonthIndex * 4 + getQuarter(startDay);
  const endColumn = endMonthIndex * 4 + getQuarter(endDay);

  // Clamp delta so neither date goes outside the timeline
  const maxColumn = months.length * 4 - 1;
  const clampedDelta = Math.max(
    -startColumn,
    Math.min(maxColumn - endColumn, deltaQuarters)
  );

  if (clampedDelta === 0) {
    return { startDate: event.startDate, endDate: event.endDate };
  }

  return {
    startDate: columnToDate(startColumn + clampedDelta, months),
    endDate: columnToDate(endColumn + clampedDelta, months),
  };
}