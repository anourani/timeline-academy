import type { TimelineEvent } from '../types/event'
import type { Month, TimelineChapter } from '../types/timeline'
import { SCROLL_LEAD_IN_MONTHS } from '../constants/timeline'
import { findMonthIndex, parseDateParts } from './dateUtils'

/**
 * Pure helpers behind the chapters strip.
 *
 * Chapters arrive from the AI pass as bare `{ label, startDate, endDate }` and
 * are persisted verbatim afterwards, so everything here has to survive a model
 * that overlapped two spans, left a gap, or emitted them out of order — and a
 * user who has since edited the events underneath them.
 */

/** An id that is stable for the life of a chapter but never persisted twice. */
function chapterId(index: number, label: string): string {
  return `chapter-${index}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/**
 * Turns a raw generated array into chapters the strip can render.
 *
 * Drops anything with an unparseable date, sorts by start, and assigns ids.
 * Deliberately does not close gaps or trim overlaps: the strip resolves the
 * active chapter by first match, so a sloppy boundary costs a pixel of
 * highlight rather than a crash, and rewriting the model's spans here would
 * make the persisted data disagree with what the user was shown.
 */
export function normalizeChapters(
  raw: Array<{ label: string; startDate: string; endDate: string }> | undefined
): TimelineChapter[] {
  if (!raw?.length) return []

  return raw
    .filter(c => parseDateParts(c.startDate) && parseDateParts(c.endDate))
    .map(c => ({
      label: c.label,
      // The prompt asks for the first of the month, but the month is the only
      // granularity the grid actually resolves — so normalise rather than trust.
      startDate: toFirstOfMonth(c.startDate),
      endDate: c.endDate
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((c, i) => ({ id: chapterId(i, c.label), ...c }))
}

function toFirstOfMonth(dateStr: string): string {
  const parts = parseDateParts(dateStr)
  if (!parts) return dateStr
  const month = String(parts.month + 1).padStart(2, '0')
  return `${String(parts.year).padStart(4, '0')}-${month}-01`
}

/**
 * The chapter containing a month index, or null.
 *
 * Works in month-index space rather than dates because that is what the scroll
 * position gives us, and because `findMonthIndex` clamps out-of-range dates to
 * the grid edges — so a chapter starting before the padded range still anchors
 * at column 0 instead of vanishing.
 */
export function findChapterAtMonth(
  chapters: TimelineChapter[],
  months: Month[],
  monthIndex: number
): TimelineChapter | null {
  if (!chapters.length || !months.length) return null
  if (monthIndex < 0) return null

  const match = chapters.find(c => {
    const start = findMonthIndex(months, c.startDate)
    const end = findMonthIndex(months, c.endDate)
    return start !== -1 && monthIndex >= start && monthIndex <= end
  })

  // Between two chapters (a gap the model left), the last one already started
  // is the honest answer — you are past its start and not yet in the next.
  if (match) return match

  let fallback: TimelineChapter | null = null
  for (const c of chapters) {
    const start = findMonthIndex(months, c.startDate)
    if (start !== -1 && start <= monthIndex) fallback = c
  }
  return fallback
}

/**
 * Months of lead-in on the active chapter.
 *
 * The active chapter is resolved from the left-most visible month, but events
 * enter from the right and scroll left — so a chapter's opening events are on
 * screen well before its start date reaches the left edge. Half a year of lead
 * lights the chip while those events are still visible, rather than after the
 * reader has already scrolled past them.
 *
 * `months` is dense (one entry per month, see `generateMonthsRange`), so half a
 * year is exactly six indices with no gaps to account for.
 */
export const CHAPTER_ACTIVE_LEAD_MONTHS = 6

/**
 * The chapter to show as active, given the left-most visible month.
 *
 * Separate from `findChapterAtMonth` so that helper stays an honest answer to
 * "which chapter contains this month" — the lead is a presentation rule, and
 * baking it in would quietly skew every other caller.
 *
 * The lead is bounded twice over, because an unbounded one lights the wrong
 * chip immediately after a jump. Jumping to a chapter parks its start
 * `SCROLL_LEAD_IN_MONTHS` past the left edge, so a full six months of lead
 * probes four months *into* the chapter — and anything shorter than that
 * lights its successor's chip, which reads as the jump having missed.
 */
export function findActiveChapter(
  chapters: TimelineChapter[],
  months: Month[],
  monthIndex: number
): TimelineChapter | null {
  if (!chapters.length || !months.length) return null

  const starts = chapters
    .map(c => findMonthIndex(months, c.startDate))
    .filter(start => start !== -1 && start > monthIndex)
    .sort((a, b) => a - b)

  // A jump lands the left edge exactly `SCROLL_LEAD_IN_MONTHS` short of its
  // chapter's start, so a start inside that window is almost always the chip
  // just clicked. Where two land there — a chapter shorter than the lead-in
  // wedged in front of the target — the later one is both the likelier target
  // and the one whose events actually fill the screen.
  const landed = starts.filter(start => start <= monthIndex + SCROLL_LEAD_IN_MONTHS).pop()
  if (landed !== undefined) return findChapterAtMonth(chapters, months, landed)

  // Otherwise the lead runs its full length, capped at the next chapter's start
  // so that it can pull that chapter forward — the whole point — without ever
  // clearing a short one entirely.
  const led = monthIndex + CHAPTER_ACTIVE_LEAD_MONTHS
  return findChapterAtMonth(chapters, months, starts.length ? Math.min(led, starts[0]) : led)
}

/** How far through a chapter a month index sits, as 0–1. */
export function chapterProgress(
  chapter: TimelineChapter,
  months: Month[],
  monthIndex: number
): number {
  const start = findMonthIndex(months, chapter.startDate)
  const end = findMonthIndex(months, chapter.endDate)
  if (start === -1 || end === -1 || end <= start) return 0

  const ratio = (monthIndex - start) / (end - start)
  return Math.min(1, Math.max(0, ratio))
}

/**
 * Events belonging to a chapter, counted on start date.
 *
 * Start date alone, so an event spanning a boundary is counted once rather
 * than in both chapters — the counts across the strip should add up to the
 * timeline's own event total.
 */
export function countEventsInChapter(
  events: TimelineEvent[],
  chapter: TimelineChapter
): number {
  return events.filter(
    e => e.startDate >= chapter.startDate && e.startDate <= chapter.endDate
  ).length
}

/** "1961 – 1966", or just "1961" when a chapter sits inside one year. */
export function chapterYearRange(chapter: TimelineChapter): string {
  const start = parseDateParts(chapter.startDate)?.year
  const end = parseDateParts(chapter.endDate)?.year
  if (start == null) return ''
  if (end == null || end === start) return String(start)
  return `${start} – ${end}`
}

/** The start year alone — the mobile chip's shortened span. */
export function chapterStartYear(chapter: TimelineChapter): string {
  const start = parseDateParts(chapter.startDate)?.year
  return start == null ? '' : String(start)
}
