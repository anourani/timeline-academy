import React from 'react';
import { Month } from '../../types/timeline';
import { getCurrentTimelinePosition } from '../../utils/timelineUtils';

interface TimelineScrollIndicatorProps {
  months: Month[];
  scrollLeft: number;
  containerWidth: number;
  contentWidth: number;
}

export function TimelineScrollIndicator({ 
  months, 
  scrollLeft, 
  containerWidth, 
  contentWidth 
}: TimelineScrollIndicatorProps) {
  if (!months.length || !contentWidth || !containerWidth) {
    return null;
  }

  const { currentMonth, isDecemberEnding } = getCurrentTimelinePosition(
    scrollLeft,
    months,
    contentWidth
  );

  const displayYear = isDecemberEnding ? currentMonth.year + 1 : currentMonth.year;

  return (
    <div className="timeline-scroll-indicator absolute left-[150px] top-[32px] bottom-[32px] w-[4px] bg-white rounded-full -translate-x-full pointer-events-none">
      <div className="timeline-scroll-indicator-upper absolute bottom-[calc(100%+40px)] left-0 w-full h-[24px] bg-white rounded-full" />
      <div className="timeline-scroll-indicator-year absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 font-mono text-2xl" style={{ color: '#FBFBFB' }}>
        {displayYear}
      </div>
    </div>
  );
}