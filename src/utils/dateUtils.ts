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