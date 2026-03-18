import React, { memo, useRef, useEffect } from 'react';
import { TimelineEvent as ITimelineEvent } from '../../types/event';
import { Month, TimelineScale } from '../../types/timeline';
import { EVENT_ROW_HEIGHT, EVENT_MIN_WIDTH } from '../../constants/timeline';

interface TimelineEventProps {
  event: ITimelineEvent & { stackIndex: number };
  months: Month[];
  categoryOffset: number;
  categoryColor?: string;
  onEventClick?: (event: ITimelineEvent) => void;
  scale?: TimelineScale;
  isDragging?: boolean;
  dragDeltaPixels?: number;
  onPointerDown?: (eventId: string, e: React.PointerEvent) => void;
}

export const TimelineEvent = memo(function TimelineEvent({
  event,
  months,
  categoryColor = '#666',
  onEventClick,
  isDragging = false,
  dragDeltaPixels = 0,
  onPointerDown,
}: TimelineEventProps) {
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    if (isDragging) {
      wasDraggingRef.current = true;
    }
  }, [isDragging]);

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
  const isDraggable = !!onPointerDown;

  const handleClick = () => {
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    if (onEventClick) {
      onEventClick(event);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (onPointerDown) {
      onPointerDown(event.id, e);
    }
  };

  const eventContent = (
    <div
      className="flex items-center h-full w-full rounded"
      style={{
        backgroundColor: isSingleDay ? 'transparent' : `${categoryColor}73`,
        padding: '2px 2px'
      }}
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

  return (
    <>
      {/* Ghost placeholder at original position during drag */}
      {isDragging && (
        <div
          className="flex items-center text-white rounded p-0.5 pointer-events-none"
          style={{
            gridColumn: `${startColumn} / ${endColumn}`,
            gridRow: event.stackIndex + 1,
            backgroundColor: 'transparent',
            minWidth: `${EVENT_MIN_WIDTH}px`,
            height: `${EVENT_ROW_HEIGHT}px`,
            zIndex: event.stackIndex,
            opacity: 0.3,
          }}
        >
          {eventContent}
        </div>
      )}

      {/* Main event element */}
      <div
        className={`flex items-center text-white group rounded p-0.5 ${
          isDragging ? 'select-none' : 'transition-colors hover:brightness-110'
        } ${isDraggable ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'}`}
        style={{
          gridColumn: `${startColumn} / ${endColumn}`,
          gridRow: event.stackIndex + 1,
          backgroundColor: 'transparent',
          minWidth: `${EVENT_MIN_WIDTH}px`,
          height: `${EVENT_ROW_HEIGHT}px`,
          zIndex: isDragging ? 1000 : event.stackIndex + 1,
          transform: isDragging
            ? `translateX(${dragDeltaPixels}px) scale(1.04)`
            : undefined,
          boxShadow: isDragging
            ? '0 8px 24px rgba(0, 0, 0, 0.45)'
            : undefined,
          opacity: isDragging ? 0.92 : 1,
          transition: isDragging
            ? 'box-shadow 150ms ease, opacity 150ms ease'
            : undefined,
        }}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onDragStart={(e) => e.preventDefault()}
        title={`${event.title} (${event.startDate}${event.endDate !== event.startDate ? ` to ${event.endDate}` : ''})`}
      >
        {eventContent}
      </div>
    </>
  );
});
