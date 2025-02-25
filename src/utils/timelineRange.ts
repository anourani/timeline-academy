import { TimelineEvent } from '../types/event';
import { Month } from '../types/timeline';

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DEFAULT_START_YEAR = 2014;
const DEFAULT_END_YEAR = 2024;

export function calculateTimelineRange(events: TimelineEvent[]) {
  if (events.length === 0) {
    return {
      startYear: DEFAULT_START_YEAR,
      endYear: DEFAULT_END_YEAR
    };
  }

  // Find earliest and latest dates from events
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

export function generateMonthsRange(startYear: number, endYear: number): Month[] {
  const months: Month[] = [];
  
  for (let year = startYear; year <= endYear; year++) {
    for (let month = 0; month < 12; month++) {
      months.push({ year, month });
    }
  }
  
  return months;
}