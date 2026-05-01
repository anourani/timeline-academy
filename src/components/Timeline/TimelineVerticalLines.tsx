import { useEffect, useRef } from 'react';
import { Month, TimelineScale } from '../../types/timeline';

interface TimelineVerticalLinesProps {
  months: Month[];
  scale: TimelineScale;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
}

const TRAILING_EDGE_KEY = '__trailing__';

function monthKey(month: Month): string {
  return `${month.year}-${month.month}`;
}

export function TimelineVerticalLines({
  months,
  scale,
  scrollContainerRef,
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
        return (
          <span
            key={key}
            ref={setSpanRef(key)}
            data-line-key={key}
            className={`timeline-vertical-line ${
              isYearBoundary ? 'bg-line-year-boundary' : 'bg-line-default'
            }`}
            style={{ left: `${i * scale.monthWidth}px` }}
          />
        );
      })}
      {(() => {
        const last = months[months.length - 1];
        const trailingIsYearBoundary = last?.month === 11;
        return (
          <span
            key={TRAILING_EDGE_KEY}
            ref={setSpanRef(TRAILING_EDGE_KEY)}
            data-line-key={TRAILING_EDGE_KEY}
            className={`timeline-vertical-line ${
              trailingIsYearBoundary ? 'bg-line-year-boundary' : 'bg-line-default'
            }`}
            style={{ left: `${months.length * scale.monthWidth}px` }}
          />
        );
      })()}
    </div>
  );
}
