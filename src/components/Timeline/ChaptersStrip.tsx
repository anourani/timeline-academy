import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TimelineEvent } from '@/types/event'
import type { Month, ScrollTarget, TimelineChapter } from '@/types/timeline'
import {
  chapterProgress,
  chapterStartYear,
  chapterYearRange,
  countEventsInChapter,
  findChapterAtMonth,
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
}

/**
 * The chapters strip — a table of contents for the timeline.
 *
 * One chip per chapter, showing its name, span and event count. The chip whose
 * chapter contains the left edge of the viewport is filled with the timeline's
 * accent and carries a progress rule showing how far through it you are.
 *
 * Lives in the band between GlobalNav and the year readout, which was already
 * empty — so a timeline with no chapters renders nothing here and the canvas
 * sits exactly where it always did.
 */
export const ChaptersStrip = memo(function ChaptersStrip({
  chapters,
  events,
  months,
  currentMonthIndex,
  accentColor,
  onSelect,
}: ChaptersStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  // Which ends actually have more chips past them. The fades stand in for the
  // hidden scrollbar, so showing one at an edge that is already flush would
  // just dim the first chip for no reason.
  const [overflow, setOverflow] = useState({ start: false, end: false })

  const active = useMemo(
    () => findChapterAtMonth(chapters, months, currentMonthIndex),
    [chapters, months, currentMonthIndex],
  )

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

  if (!chapters.length) return null

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex h-[40px] items-center gap-2 overflow-x-auto scrollbar-hide px-4 md:px-6"
      >
        {chapters.map((chapter) => {
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
              style={
                isActive
                  ? { backgroundColor: `${accentColor}33`, borderColor: `${accentColor}99` }
                  : undefined
              }
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
