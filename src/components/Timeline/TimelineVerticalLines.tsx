import { memo, useEffect, useMemo, useRef } from 'react';
import { Month, TimelineScale } from '../../types/timeline';

interface TimelineVerticalLinesProps {
  months: Month[];
  scale: TimelineScale;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  /** Plays the axis-assembly animation. True only for the mount that follows
   *  an AI generation starting; see `introLineStyle`. */
  intro?: boolean;
}

/** One line's slice of the assembly. */
const INTRO_LINE_MS = 550;
const INTRO_LINE_START_MS = 300;
const INTRO_LINE_STAGGER_MS = 11;
/** Year boundaries land after the month lines around them, so the year grid
 *  reads as a second pass over the first rather than one undifferentiated
 *  sweep. */
const INTRO_YEAR_EXTRA_MS = 80;
/** Lines this far outside the viewport still animate, so a small scroll
 *  during the intro does not reveal an un-animated edge. */
const INTRO_OFFSCREEN_MARGIN = 2;

const TRAILING_EDGE_KEY = '__trailing__';

function monthKey(month: Month): string {
  return `${month.year}-${month.month}`;
}

export const TimelineVerticalLines = memo(function TimelineVerticalLines({
  months,
  scale,
  scrollContainerRef,
  intro = false,
}: TimelineVerticalLinesProps) {
  const spanRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const revealedKeys = useRef<Set<string>>(new Set());

  // Content-based key over the months range so the observer effect only re-runs
  // when the set of spans actually changes — not on every Timeline re-render.
  const monthsRangeKey = months.length > 0
    ? `${monthKey(months[0])}..${monthKey(months[months.length - 1])}`
    : '';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const reveal = (key: string, el: HTMLSpanElement) => {
      revealedKeys.current.add(key);
      el.dataset.revealed = 'true';
    };

    const reduceMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      spanRefs.current.forEach((el, key) => {
        reveal(key, el);
      });
      return;
    }

    const root = scrollContainerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLSpanElement;
          const key = el.dataset.lineKey;
          if (!key) continue;
          reveal(key, el);
          observer.unobserve(el);
        }
      },
      { root, rootMargin: '0px', threshold: 0 },
    );

    spanRefs.current.forEach((el, key) => {
      if (revealedKeys.current.has(key)) return;
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
    // Re-run when the set of spans changes (months added/removed) or the
    // scroll container ref resolves. Span horizontal positions are driven by
    // CSS transitions, so scale changes don't require a new observer.
  }, [months.length, monthsRangeKey, scrollContainerRef]);

  // Measured once, when the intro starts. The animation is keyed to the
  // viewport ("line 0 is the leftmost one you can see"), and the parked
  // scroll position is the only thing that maps that to an index.
  const introWindow = useMemo(() => {
    if (!intro) return null;
    const el = scrollContainerRef.current;
    const scrollLeft = el?.scrollLeft ?? 0;
    const width = el?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
    const first = Math.floor(scrollLeft / scale.monthWidth);
    const last = Math.ceil((scrollLeft + width) / scale.monthWidth);
    return { first, last };
    // Deliberately not re-measured on scroll: this is a one-shot at mount,
    // and recomputing would restart delays for lines mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro]);

  /**
   * The off-screen start and the delay for one line.
   *
   * Alternating direction by visible index is what makes the axis read as
   * assembling rather than wiping: neighbouring lines arrive from opposite
   * edges and meet. Lines outside the viewport get nothing — there is no
   * point spending animation on what no one can see, and a 3,700-month
   * timeline would otherwise schedule thousands of them.
   */
  const introLineStyle = (i: number, isYearBoundary: boolean) => {
    if (!introWindow) return undefined;
    const { first, last } = introWindow;
    if (i < first - INTRO_OFFSCREEN_MARGIN || i > last + INTRO_OFFSCREEN_MARGIN) {
      return undefined;
    }
    const v = i - first;
    const name =
      v % 2 === 0
        ? 'timeline-intro-line-from-top'
        : 'timeline-intro-line-from-bottom';
    const delay =
      INTRO_LINE_START_MS +
      v * INTRO_LINE_STAGGER_MS +
      (isYearBoundary ? INTRO_YEAR_EXTRA_MS : 0);
    return {
      animation: `${name} ${INTRO_LINE_MS}ms var(--ease-enter) ${delay}ms both`,
    };
  };

  const setSpanRef = (key: string) => (el: HTMLSpanElement | null) => {
    if (el) {
      spanRefs.current.set(key, el);
      if (revealedKeys.current.has(key)) {
        el.dataset.revealed = 'true';
      }
    } else {
      spanRefs.current.delete(key);
    }
  };

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none overflow-hidden"
    >
      {months.map((month, i) => {
        const key = monthKey(month);
        // Each span is the boundary line at left = i * monthWidth, with
        // months[i-1] on its left side. A year boundary sits between Dec
        // and Jan, so the span is a year boundary when its left-side
        // neighbor is December.
        const prev = i > 0 ? months[i - 1] : null;
        const isYearBoundary = prev?.month === 11;
        // Only year-boundary lines take part in the scroll-in reveal, so only
        // they need a ref, a data-line-key and an observer entry. Month lines
        // render at full height and are left alone.
        return (
          <span
            key={key}
            ref={isYearBoundary ? setSpanRef(key) : undefined}
            data-line-key={isYearBoundary ? key : undefined}
            data-timeline-intro={intro ? '' : undefined}
            data-revealed={intro && isYearBoundary ? 'true' : undefined}
            className={
              isYearBoundary
                ? 'timeline-vertical-line timeline-vertical-line-reveal bg-line-year-boundary'
                : 'timeline-vertical-line bg-line-default'
            }
            style={{
              left: `${i * scale.monthWidth}px`,
              ...introLineStyle(i, isYearBoundary),
            }}
          />
        );
      })}
      {(() => {
        const last = months[months.length - 1];
        const trailingIsYearBoundary = last?.month === 11;
        return (
          <span
            key={TRAILING_EDGE_KEY}
            ref={trailingIsYearBoundary ? setSpanRef(TRAILING_EDGE_KEY) : undefined}
            data-line-key={trailingIsYearBoundary ? TRAILING_EDGE_KEY : undefined}
            data-timeline-intro={intro ? '' : undefined}
            data-revealed={intro && trailingIsYearBoundary ? 'true' : undefined}
            className={
              trailingIsYearBoundary
                ? 'timeline-vertical-line timeline-vertical-line-reveal bg-line-year-boundary'
                : 'timeline-vertical-line bg-line-default'
            }
            style={{
              left: `${months.length * scale.monthWidth}px`,
              ...introLineStyle(months.length, trailingIsYearBoundary),
            }}
          />
        );
      })()}
    </div>
  );
});
