import { useState, useEffect, RefObject } from 'react';
import { rafThrottle } from '../utils/rafThrottle';

interface TimelineScrollState {
  scrollLeft: number;
  containerWidth: number;
  contentWidth: number;
  visibleRange: {
    start: number;
    end: number;
  };
}

export function useTimelineScroll(
  scrollContainerRef: RefObject<HTMLDivElement>,
  totalMonths: number
): TimelineScrollState {
  const [scrollState, setScrollState] = useState<TimelineScrollState>({
    scrollLeft: 0,
    containerWidth: 0,
    contentWidth: 0,
    visibleRange: {
      start: 0,
      end: 0,
    },
  });

  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current) return;

      const {
        scrollLeft,
        clientWidth: containerWidth,
        scrollWidth: contentWidth,
      } = scrollContainerRef.current;

      // Calculate visible range in months
      const monthWidth = totalMonths > 0 ? contentWidth / totalMonths : 0;
      const startMonth = monthWidth > 0 ? Math.floor(scrollLeft / monthWidth) : 0;
      const visibleMonths = monthWidth > 0 ? Math.ceil(containerWidth / monthWidth) : 0;
      const end = Math.min(startMonth + visibleMonths, totalMonths);

      // Bail when nothing moved. A fresh object every call re-renders the whole
      // timeline — every month label, grid track and vertical line — and during
      // a window drag this fires on every frame from three sources at once.
      setScrollState(prev =>
        prev.scrollLeft === scrollLeft &&
        prev.containerWidth === containerWidth &&
        prev.contentWidth === contentWidth &&
        prev.visibleRange.start === startMonth &&
        prev.visibleRange.end === end
          ? prev
          : {
              scrollLeft,
              containerWidth,
              contentWidth,
              visibleRange: { start: startMonth, end },
            }
      );
    };

    // One update per frame, *during* the gesture. This was a 16ms trailing
    // debounce, which could not work here: `resize` and the ResizeObserver both
    // fire every frame, so the calls land closer together than the wait and
    // each one cleared the pending timer. The handler ran only once the drag
    // ended, and the whole timeline snapped to its new size in one step.
    const throttledScroll = rafThrottle(handleScroll);

    const container = scrollContainerRef.current;
    let observer: ResizeObserver | undefined;

    if (container) {
      container.addEventListener('scroll', throttledScroll);
      // Initial calculation
      handleScroll();
      // Recalculate on resize
      window.addEventListener('resize', throttledScroll);
      // The window listener alone is not enough: resizing the side panel
      // changes this container's width (it is a push layout) without firing a
      // window resize, which would leave containerWidth — and so the sticky
      // year indicator driven by visibleRange — stale until the next scroll.
      observer = new ResizeObserver(throttledScroll);
      observer.observe(container);
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', throttledScroll);
        window.removeEventListener('resize', throttledScroll);
        observer?.disconnect();
      }
      throttledScroll.cancel();
    };
  }, [scrollContainerRef, totalMonths]);

  return scrollState;
}
