import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TimelineEvent } from '@/types/event'
import type { Month, ScrollTarget, TimelineChapter } from '@/types/timeline'
import {
  chapterProgress,
  chapterStartYear,
  chapterYearRange,
  countEventsInChapter,
  findActiveChapter,
} from '@/utils/chapters'

interface ChaptersStripProps {
  chapters: TimelineChapter[]
  events: TimelineEvent[]
  months: Month[]
  /** Left-most visible month of the canvas, in `months` index space. */
  currentMonthIndex: number
  /** The nav's dominant-category colour, so the strip matches the status dot. */
  accentColor: string
  onSelect?: (target: ScrollTarget) => void
  /**
   * Number of placeholder chips to show while a generation is streaming.
   *
   * Chapters arrive early — before any event — but not instantly, and an
   * empty band above a building axis reads as something missing. Real chips
   * replace placeholders one for one as they land; any left over fade out.
   */
  placeholderCount?: number
}

const CHIP_ENTER_MS = 350
const CHIP_ENTER_STAGGER_MS = 100
const PLACEHOLDER_ENTER_MS = 300
const PLACEHOLDER_START_MS = 750
const PLACEHOLDER_STAGGER_MS = 60
/** Matches the resting chip: 11px padding either side of ~14px text. */
const PLACEHOLDER_WIDTH = 180
const PLACEHOLDER_BAR_WIDTH = '72%'

/**
 * The chapters strip — a table of contents for the timeline.
 *
 * One chip per chapter, showing its name, span and event count. The chip for the
 * chapter the viewport is reading — the left edge plus half a year of lead, see
 * `findActiveChapter` — is filled with the timeline's accent and carries a
 * progress rule showing how far through it you actually are.
 *
 * Lives in the band between GlobalNav and the canvas, which was already empty
 * — so a timeline with no chapters renders nothing here and the canvas sits
 * exactly where it always did.
 */
export const ChaptersStrip = memo(function ChaptersStrip({
  chapters,
  events,
  months,
  currentMonthIndex,
  accentColor,
  onSelect,
  placeholderCount = 0,
}: ChaptersStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  // Which ends actually have more chips past them. The fades stand in for the
  // hidden scrollbar, so showing one at an edge that is already flush would
  // just dim the first chip for no reason.
  const [overflow, setOverflow] = useState({ start: false, end: false })

  const active = useMemo(
    () => findActiveChapter(chapters, months, currentMonthIndex),
    [chapters, months, currentMonthIndex],
  )

  // Progress reads the true position, not the led one: during the lead-in the
  // ratio is negative and clamps to 0, so the chip lights up with an empty rule
  // and starts filling exactly when the chapter's start crosses the left edge.
  const progress = active ? chapterProgress(active, months, currentMonthIndex) : 0

  // Keep the current chip visible as the canvas scrolls past it. `nearest`
  // vertically so a strip near the top of the page can't drag the whole
  // document down with it.
  useEffect(() => {
    if (!active || !activeRef.current) return
    activeRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [active])

  const syncOverflow = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    // 1px of slack: fractional layout widths leave scrollLeft a hair short of
    // the true maximum, which would pin the right fade on permanently.
    setOverflow({
      start: el.scrollLeft > 1,
      end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    syncOverflow()
    el.addEventListener('scroll', syncOverflow, { passive: true })
    // Chip widths change with the chapter set and the viewport, and the smooth
    // scroll above settles after this effect runs — an observer catches both
    // without polling.
    const observer = new ResizeObserver(syncOverflow)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', syncOverflow)
      observer.disconnect()
    }
  }, [syncOverflow, chapters])

  // A timeline with no chapters renders nothing here, as it always has — but
  // placeholders are the one case where an empty chapter list still has
  // something to show, because they exist precisely for the window before
  // the first chapter arrives.
  if (!chapters.length && placeholderCount === 0) return null

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex h-[40px] items-center gap-2 overflow-x-auto scrollbar-hide px-4 md:px-6"
      >
        {chapters.map((chapter, chapterIndex) => {
          const isActive = active?.id === chapter.id
          const count = countEventsInChapter(events, chapter)

          return (
            <button
              key={chapter.id}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onSelect?.({ date: chapter.startDate, align: 'start' })}
              aria-current={isActive ? 'true' : undefined}
              title={`${chapter.label} · ${chapterYearRange(chapter)} · ${count} events`}
              className={`
                relative flex shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap
                rounded-[10px] border px-[11px] py-[6px]
                font-['Avenir',sans-serif] text-[14px] font-medium
                backdrop-blur-[12px] transition-all
                shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
                ${isActive
                  ? 'text-[#F3F3F3]'
                  : 'border-white/[0.15] bg-white/10 text-[#c9ced4] hover:bg-white/20 hover:text-[#dadee5]'
                }
              `}
              style={{
                ...(isActive
                  ? { backgroundColor: `${accentColor}33`, borderColor: `${accentColor}99` }
                  : undefined),
                // Only while a generation is running: outside one, chapters
                // are already there and should not animate on every render.
                ...(placeholderCount > 0
                  ? {
                      animation: `timeline-intro-rise-in ${CHIP_ENTER_MS}ms var(--ease-enter) ${
                        chapterIndex * CHIP_ENTER_STAGGER_MS
                      }ms both`,
                    }
                  : undefined),
              }}
            >
              {isActive && (
                <>
                  {/* Track first, fill over it — a two-element rule rather than
                      a gradient, so the boundary stays crisp at any width. */}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[#262626]" />
                  <span
                    className="pointer-events-none absolute bottom-0 left-0 h-[2px] transition-[width] duration-200"
                    style={{ width: `${progress * 100}%`, backgroundColor: accentColor }}
                  />
                </>
              )}

              <span className="relative">{chapter.label}</span>

              {/* IBM Plex Mono via font-mono, matching the year labels and the
                  readout below — the strip is reading the same axis they are. */}
              <span
                className={`relative hidden font-mono text-[12px] sm:inline ${
                  isActive ? 'text-[#C9CED4]' : 'text-[#9B9EA3]'
                }`}
              >
                {chapterYearRange(chapter)}
              </span>
              <span
                className={`relative font-mono text-[11px] sm:hidden ${
                  isActive ? 'text-[#C9CED4]' : 'text-[#9B9EA3]'
                }`}
              >
                {chapterStartYear(chapter)}
              </span>

              {/* The count is the first thing to go on a narrow screen: it is
                  the least useful of the three at a glance. */}
              <span
                className={`relative hidden font-mono text-[11px] sm:inline ${
                  isActive ? 'text-[#9B9EA3]' : 'text-[#6D7073]'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}

        {/* Placeholders for chapters still in flight. Same geometry as a
            real chip so the strip does not reflow as they are replaced —
            only the contents swap. aria-hidden per the house rule in
            ui/skeleton.tsx: the wait is announced once, elsewhere. */}
        {Array.from(
          { length: Math.max(placeholderCount - chapters.length, 0) },
          (_, i) => (
            <div
              key={`chapter-placeholder-${i}`}
              aria-hidden="true"
              className="flex shrink-0 items-center rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-[11px] py-[6px] backdrop-blur-[12px]"
              style={{
                width: PLACEHOLDER_WIDTH,
                height: 35,
                animation: `timeline-intro-fade-in ${PLACEHOLDER_ENTER_MS}ms var(--ease-enter) ${
                  PLACEHOLDER_START_MS + (chapters.length + i) * PLACEHOLDER_STAGGER_MS
                }ms both`,
              }}
            >
              <div
                className="h-[14px] rounded-[4px] bg-white/[0.08] animate-pulse"
                style={{
                  width: PLACEHOLDER_BAR_WIDTH,
                  animationDelay: `${i * PLACEHOLDER_STAGGER_MS}ms`,
                }}
              />
            </div>
          ),
        )}
      </div>

      {/* Edge fades stand in for the scrollbar the strip deliberately hides,
          and only on the side that actually has more chips past it. */}
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black to-transparent transition-opacity ${
          overflow.start ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black to-transparent transition-opacity sm:w-20 ${
          overflow.end ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
})
