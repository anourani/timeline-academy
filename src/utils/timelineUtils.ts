import { Month } from '../types/timeline';
import { TimelineEvent } from '../types/event';

export function getUniqueYears(months: Month[]): number[] {
  return Array.from(new Set(months.map(month => month.year))).sort();
}

export function getMonthsInYear(months: Month[], year: number): Month[] {
  return months.filter(month => month.year === year);
}

export function calculateYearWidth(months: Month[], year: number): number {
  const yearMonths = getMonthsInYear(months, year);
  return (yearMonths.length / months.length) * 100;
}

export function getMonthPosition(
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

export function getTimelineYearRange(events: TimelineEvent[]): string {
  if (events.length === 0) {
    // Empty timeline - show current year
    const currentYear = new Date().getFullYear();
    return `${currentYear}`;
  }

  // Get all years from events
  const years = events.flatMap(event => [
    new Date(event.startDate).getFullYear(),
    new Date(event.endDate).getFullYear()
  ]);

  const startYear = Math.min(...years);
  const endYear = Math.max(...years);

  // If it's the same year, just show one year
  if (startYear === endYear) {
    return `${startYear}`;
  }

  // Show range with en dash for different years
  return `${startYear}–${endYear}`;
}