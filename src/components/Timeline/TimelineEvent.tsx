import React, { memo } from 'react';
import { TimelineEvent as ITimelineEvent } from '../../types/event';
import { Month } from '../../types/timeline';

interface TimelineEventProps {
  event: ITimelineEvent & { stackIndex: number };
  months: Month[];
  categoryOffset: number;
  categoryColor?: string;
  onEventClick?: (event: ITimelineEvent) => void;
}

export const TimelineEvent = memo(function TimelineEvent({ 
  event, 
  months,
  categoryOffset,
  categoryColor = '#666',
  onEventClick
}: TimelineEventProps) {
  if (!months.length) return null;

  // Parse dates
  const [startYear, startMonth, startDay] = event.startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = event.endDate.split('-').map(Number);
  
  // Calculate which quarter of the month the day falls into (1-8, 9-16, 17-24, 25-32)
  const getQuarter = (day: number) => Math.floor((day - 1) / 8);
  
  const startQuarter = getQuarter(startDay);
  const endQuarter = getQuarter(endDay);
  
  // Find the month indices in the timeline
  const startMonthIndex = months.findIndex(
    m => m.year === startYear && m.month === startMonth - 1
  );
  const endMonthIndex = months.findIndex(
    m => m.year === endYear && m.month === endMonth - 1
  );

  // Calculate grid columns based on month index
  const startColumn = (startMonthIndex * 4) + startQuarter + 1;
  const endColumn = (endMonthIndex * 4) + endQuarter + 2;

  const isSingleDay = event.startDate === event.endDate;
  const EVENT_HEIGHT = 36;

  const handleClick = () => {
    if (onEventClick) {
      onEventClick(event);
    }
  };

  return (
    <div
      className="flex items-center text-white cursor-pointer group rounded transition-colors hover:brightness-110"
      style={{
        gridColumn: `${startColumn} / ${endColumn}`,
        gridRow: event.stackIndex + 1,
        backgroundColor: isSingleDay ? 'transparent' : `${categoryColor}73`,
        minWidth: '120px',
        height: `${EVENT_HEIGHT}px`,
        padding: '2px',
        zIndex: event.stackIndex + 1,
      }}
      onClick={handleClick}
      title={`${event.title} (${event.startDate}${event.endDate !== event.startDate ? ` to ${event.endDate}` : ''})`}
    >
      <div 
        className="h-full w-[8px] rounded flex-shrink-0"
        style={{ backgroundColor: categoryColor }}
      />
      <div className="pl-1 whitespace-nowrap text-base font-medium overflow-visible">
        {event.title}
      </div>
    </div>
  );
});