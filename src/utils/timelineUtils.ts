import { Month } from '../types/timeline';
import { TimelineEvent } from '../types/event';
import { parseDateParts } from './dateUtils';

export function getUniqueYears(months: Month[]): number[] {
  return Array.from(new Set(months.map(month => month.year))).sort();
}

function getMonthPosition(
  monthIndex: number,
  totalMonths: number,
  contentWidth: number
): { start: number; end: number } {
  const monthWidth = contentWidth / totalMonths;
  return {
    start: monthIndex * monthWidth,
    end: (monthIndex + 1) * monthWidth,
  };
}

export function getCurrentTimelinePosition(
  scrollLeft: number,
  months: Month[],
  contentWidth: number,
  labelWidth: number = 120
): { 
  currentMonth: Month;
  nextMonth: Month | null;
  isDecemberEnding: boolean;
} {
  const indicatorPosition = scrollLeft + labelWidth;
  const monthWidth = contentWidth / months.length;
  const currentMonthIndex = Math.min(
    Math.floor(indicatorPosition / monthWidth),
    months.length - 1
  );
  
  const currentMonth = months[currentMonthIndex];
  const nextMonth = currentMonthIndex < months.length - 1 ? months[currentMonthIndex + 1] : null;
  
  // Check if December is ending (fully crossed the line)
  const monthPosition = getMonthPosition(currentMonthIndex, months.length, contentWidth);
  const isDecemberEnding = currentMonth.month === 11 && 
    indicatorPosition >= monthPosition.end;

  return {
    currentMonth,
    nextMonth,
    isDecemberEnding,
  };
}

/** Returns the Tailwind border-color class for a month's right-side vertical line.
 *  December (month === 11) gets Grey-800 to mark year boundaries.
 *  All other months get Grey-900. */
export function getMonthBorderClass(month: Month): string {
  return month.month === 11 ? 'border-line-year-boundary' : 'border-line-default';
}

export function getTimelineYearRange(events: TimelineEvent[]): string {
  if (events.length === 0) {
    // Empty timeline - show current year
    const currentYear = new Date().getFullYear();
    return `${currentYear}`;
  }

  // Years come from the string, not from `new Date(str).getFullYear()`, which
  // parses as UTC and reads back local — reporting the previous year for a
  // January-1st date anywhere west of UTC. That mismatch is what made this
  // label read `1596-1899` for a timeline whose last date is 1900-01-01, while
  // the axis beside it was computed from the same dates a different way.
  const years = events
    .flatMap(event => [event.startDate, event.endDate])
    .map(parseDateParts)
    .filter((parts): parts is NonNullable<typeof parts> => parts !== null)
    .map(parts => parts.year);

  if (years.length === 0) {
    return `${new Date().getFullYear()}`;
  }

  const startYear = Math.min(...years);
  const endYear = Math.max(...years);

  // If it's the same year, just show one year
  if (startYear === endYear) {
    return `${startYear}`;
  }

  // Show range with en dash for different years
  return `${startYear}–${endYear}`;
}