import { useMemo } from 'react';
import { TimelineEvent, TimelineCategory } from '../types/event';
import { CATEGORIES } from '../constants/categories';

interface CategoryHeight {
  id: TimelineCategory;
  height: number;
}

function doEventsOverlap(event1: TimelineEvent, event2: TimelineEvent): boolean {
  const start1 = new Date(event1.startDate);
  const end1 = new Date(event1.endDate);
  const start2 = new Date(event2.startDate);
  const end2 = new Date(event2.endDate);

  return start1 <= end2 && end1 >= start2;
}

function getMaxOverlappingEvents(events: TimelineEvent[]): number {
  if (events.length === 0) return 0;

  // Sort events by start date
  const sortedEvents = [...events].sort((a, b) => 
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  let maxOverlap = 1;
  
  for (let i = 0; i < events.length; i++) {
    let currentOverlap = 1;
    for (let j = 0; j < events.length; j++) {
      if (i !== j && doEventsOverlap(sortedEvents[i], sortedEvents[j])) {
        currentOverlap++;
      }
    }
    maxOverlap = Math.max(maxOverlap, currentOverlap);
  }

  return maxOverlap;
}

export function useCategoryHeights(events: TimelineEvent[]): CategoryHeight[] {
  return useMemo(() => {
    const MIN_CATEGORY_HEIGHT = 72;
    const EVENT_HEIGHT = 32; // 8px × 4 for Tailwind's h-8
    const EVENT_GAP = 2;

    return CATEGORIES.map(category => {
      const categoryEvents = events.filter(event => event.category === category.id);
      const maxOverlap = getMaxOverlappingEvents(categoryEvents);
      
      // Calculate height based on overlapping events
      const heightFromEvents = maxOverlap > 0
        ? (maxOverlap * EVENT_HEIGHT) + ((maxOverlap - 1) * EVENT_GAP)
        : 0;

      return {
        id: category.id,
        height: Math.max(MIN_CATEGORY_HEIGHT, heightFromEvents)
      };
    });
  }, [events]);
}