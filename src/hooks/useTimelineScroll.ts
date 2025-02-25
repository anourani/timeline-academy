import { useState, useEffect, RefObject } from 'react';

interface TimelineScrollState {
  scrollLeft: number;
  containerWidth: number;
  contentWidth: number;
  visibleRange: {
    start: number;
    end: number;
  };
}

function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
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
    if (container) {
      container.addEventListener('scroll', debouncedScroll);
      // Initial calculation
      handleScroll();
      // Recalculate on resize
      window.addEventListener('resize', debouncedScroll);
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', debouncedScroll);
        window.removeEventListener('resize', debouncedScroll);
      }
    };
  }, [scrollContainerRef, totalMonths]);

  return scrollState;
}