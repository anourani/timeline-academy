import { useState, useEffect, RefObject } from 'react';
import { debounce } from '../utils/debounce';

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
      const monthWidth = contentWidth / totalMonths;
      const startMonth = Math.floor(scrollLeft / monthWidth);
      const visibleMonths = Math.ceil(containerWidth / monthWidth);

      setScrollState({
        scrollLeft,
        containerWidth,
        contentWidth,
        visibleRange: {
          start: startMonth,
          end: Math.min(startMonth + visibleMonths, totalMonths),
        },
      });
    };

    const debouncedScroll = debounce(handleScroll, 16); // ~60fps

    const container = scrollContainerRef.current;
    let observer: ResizeObserver | undefined;

    if (container) {
      container.addEventListener('scroll', debouncedScroll);
      // Initial calculation
      handleScroll();
      // Recalculate on resize
      window.addEventListener('resize', debouncedScroll);
      // The window listener alone is not enough: resizing the side panel
      // changes this container's width (it is a push layout) without firing a
      // window resize, which would leave containerWidth — and so the sticky
      // year indicator driven by visibleRange — stale until the next scroll.
      observer = new ResizeObserver(debouncedScroll);
      observer.observe(container);
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', debouncedScroll);
        window.removeEventListener('resize', debouncedScroll);
        observer?.disconnect();
      }
    };
  }, [scrollContainerRef, totalMonths]);

  return scrollState;
}