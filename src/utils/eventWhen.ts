import { differenceInCalendarDays, endOfMonth, format, isSameDay } from 'date-fns'
import { parseDate } from './dateUtils'

// The "When" row of the event view's At a glance list
// (docs/2026-11-24-event-view-prd.md §6). Derived from the event's own dates,
// never from the model, so it is right for every event — old descriptions,
// failed generations and World Events entries included.

export interface EventWhen {
  /** "July 16, 1969", "July 16 – 24, 1969", "July – December 1898", … */
  date: string
  /** "8 days", "about 6 months", "about 4 years"; null for a single day. */
  duration: string | null
}

/** True when the range runs from the first of one month to the last day of another. */
function isWholeMonths(start: Date, end: Date): boolean {
  return start.getDate() === 1 && isSameDay(end, endOfMonth(end))
}

function describeDuration(days: number): string | null {
  if (days < 1) return null
  if (days === 1) return '1 day'
  if (days < 14) return `${days} days`
  if (days < 60) return `about ${Math.round(days / 7)} weeks`
  const months = Math.round(days / 30.44)
  if (months < 24) return `about ${months} months`
  return `about ${Math.round(days / 365.25)} years`
}

export function formatEventWhen(startDate: string, endDate: string): EventWhen | null {
  const start = parseDate(startDate)
  if (!start) return null
  const end = parseDate(endDate) ?? start

  if (isSameDay(start, end)) {
    return { date: format(start, 'MMMM d, yyyy'), duration: null }
  }

  const sameYear = start.getFullYear() === end.getFullYear()
  let date: string
  if (isWholeMonths(start, end)) {
    date = sameYear
      ? `${format(start, 'MMMM')} – ${format(end, 'MMMM yyyy')}`
      : `${format(start, 'MMMM yyyy')} – ${format(end, 'MMMM yyyy')}`
  } else if (sameYear && start.getMonth() === end.getMonth()) {
    date = `${format(start, 'MMMM d')} – ${format(end, 'd, yyyy')}`
  } else if (sameYear) {
    date = `${format(start, 'MMMM d')} – ${format(end, 'MMMM d, yyyy')}`
  } else {
    date = `${format(start, 'MMMM d, yyyy')} – ${format(end, 'MMMM d, yyyy')}`
  }

  // Elapsed, the way people say it: the 16th to the 24th is "8 days". Whole
  // months land on the right count either way (Jul 1 – Dec 31 is 183 days).
  const days = differenceInCalendarDays(end, start)
  return { date, duration: describeDuration(days) }
}
