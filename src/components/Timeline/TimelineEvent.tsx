import React, { memo, useRef, useEffect, useState, useLayoutEffect } from 'react';
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
  rowHeight?: number;
  onMounted?: (eventId: string, node: HTMLDivElement | null) => void;
}

const STACK_TRANSITION_MS = 220;

export const TimelineEvent = memo(function TimelineEvent({
  event,
  months,
  categoryColor = '#666',
  onEventClick,
  isDragging = false,
  dragDeltaPixels = 0,
  onPointerDown,
  rowHeight = EVENT_ROW_HEIGHT,
  onMounted,
}: TimelineEventProps) {
  const wasDraggingRef = useRef(false);
  const elementRef = useRef<HTMLDivElement | null>(null);

  // FLIP-style transition when stackIndex changes between renders.
  // Phase progression: 'idle' -> 'jumping' (transform = oldDelta, no transition)
  // -> 'animating' (transform = 0, with transition) -> 'idle'.
  const [animPhase, setAnimPhase] = useState<'idle' | 'jumping' | 'animating'>('idle');
  const [animOffset, setAnimOffset] = useState(0);
  const lastSeenStackRef = useRef(event.stackIndex);

  useLayoutEffect(() => {
    const prev = lastSeenStackRef.current;
    if (prev !== event.stackIndex && !isDragging) {
      const delta = (prev - event.stackIndex) * rowHeight;
      if (delta !== 0) {
        setAnimOffset(delta);
        setAnimPhase('jumping');
      }
    }
    lastSeenStackRef.current = event.stackIndex;
  }, [event.stackIndex, rowHeight, isDragging]);

  useLayoutEffect(() => {
    if (animPhase !== 'jumping') return;
    // Two RAFs: first lets the browser commit the "jumped" frame with no
    // transition, second flips into the animating frame with transition on.
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => {
        setAnimPhase('animating');
        setAnimOffset(0);
      });
      // Stash so cleanup can cancel either pending frame.
      cleanupRef.current = id2;
    });
    cleanupRef.current = id1;
    return () => {
      if (cleanupRef.current !== null) cancelAnimationFrame(cleanupRef.current);
    };
  }, [animPhase]);

  const cleanupRef = useRef<number | null>(null);

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

  const setRef = (node: HTMLDivElement | null) => {
    elementRef.current = node;
    if (onMounted) onMounted(event.id, node);
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName === 'transform' && animPhase === 'animating') {
      setAnimPhase('idle');
      setAnimOffset(0);
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
      <div className="pl-1 whitespace-nowrap body-lg overflow-visible">
        {event.title}
      </div>
    </div>
  );

  // Build the transform/transition for the main element. Drag takes priority
  // over the stack-reflow transition (the dragged event animates separately).
  let transform: string | undefined;
  let transition: string | undefined;
  if (isDragging) {
    transform = `translateX(${dragDeltaPixels}px) scale(1.04)`;
    transition = 'box-shadow 150ms ease, opacity 150ms ease';
  } else if (animPhase === 'jumping') {
    transform = `translateY(${animOffset}px)`;
    transition = 'none';
  } else if (animPhase === 'animating') {
    transform = 'translateY(0px)';
    transition = `transform ${STACK_TRANSITION_MS}ms ease`;
  }

  return (
    <>
      {/* Ghost placeholder at original position during drag */}
      {isDragging && (
        <div
          className="flex items-center text-text-secondary rounded p-0.5 pointer-events-none"
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
        ref={setRef}
        className={`flex items-center text-text-secondary hover:text-text-primary group rounded p-0.5 ${
          isDragging ? 'select-none' : 'transition-colors hover:brightness-110'
        } ${isDraggable ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'}`}
        style={{
          gridColumn: `${startColumn} / ${endColumn}`,
          gridRow: event.stackIndex + 1,
          backgroundColor: 'transparent',
          minWidth: `${EVENT_MIN_WIDTH}px`,
          height: `${EVENT_ROW_HEIGHT}px`,
          zIndex: isDragging ? 1000 : event.stackIndex + 1,
          transform,
          boxShadow: isDragging
            ? '0 8px 24px rgba(0, 0, 0, 0.45)'
            : undefined,
          opacity: isDragging ? 0.92 : 1,
          transition,
        }}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onDragStart={(e) => e.preventDefault()}
        onTransitionEnd={handleTransitionEnd}
        title={`${event.title} (${event.startDate}${event.endDate !== event.startDate ? ` to ${event.endDate}` : ''})`}
      >
        {eventContent}
      </div>
    </>
  );
});
