import React, { useRef, useState, useCallback, useEffect } from 'react';
import { TimelineHeader } from './TimelineHeader';
import { TimelineGrid } from './TimelineGrid';
import { TimelineCategoryLabels } from './TimelineCategoryLabels';
import { TimelineEvent } from './TimelineEvent';
import { TimelineScrollIndicator } from './TimelineScrollIndicator';
import { TimelineOverview } from './TimelineOverview';
import { TimelineEvent as ITimelineEvent, CategoryConfig } from '../../types/event';
import { TimelineScale } from '../../types/timeline';
import { getTimelineRange, shiftEventDates } from '../../utils/dateUtils';
import { calculateEventStacks } from '../../utils/eventStacking';
import { useTimelineScroll } from '../../hooks/useTimelineScroll';
import { useEventDrag } from '../../hooks/useEventDrag';
import { EVENT_HEIGHT, CATEGORY_PADDING, CATEGORY_MIN_HEIGHT, SCROLL_INDICATOR_HEIGHT, HEADER_HEIGHT } from '../../constants/timeline';
import { EventForm } from '../EventForm/EventForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TimelineProps {
  events: ITimelineEvent[];
  categories: CategoryConfig[];
  isFullScreen?: boolean;
  onAddEvent?: (event: Omit<ITimelineEvent, 'id'>) => void;
  onUpdateEvent?: (event: ITimelineEvent) => void;
  scale: TimelineScale;
  pendingScrollDate?: string | null;
  onScrollComplete?: () => void;
}

export function Timeline({
  events,
  categories,
  isFullScreen,
  onAddEvent,
  onUpdateEvent,
  scale,
  pendingScrollDate,
  onScrollComplete
}: TimelineProps) {
  // Filter visible categories and their events
  const visibleCategories = categories.filter(cat => cat.visible);
  const visibleEvents = events.filter(event => 
    visibleCategories.some(cat => cat.id === event.category)
  );

  const { startDate, endDate, months } = getTimelineRange(visibleEvents);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<ITimelineEvent | null>(null);
  
  const { visibleRange } = useTimelineScroll(scrollContainerRef, months.length * 4);

  const scrollToDate = useCallback((dateStr: string) => {
    if (!months.length || !scrollContainerRef.current) return;

    const [year, month] = dateStr.split('-').map(Number);
    const monthIndex = months.findIndex(m => m.year === year && m.month === month - 1);
    if (monthIndex === -1) return;

    const pixelOffset = monthIndex * scale.monthWidth;
    const viewportWidth = scrollContainerRef.current.clientWidth;
    const targetLeft = pixelOffset - (viewportWidth / 2) + (scale.monthWidth / 2);

    scrollContainerRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }, [months, scale.monthWidth]);

  // Drag-and-drop event repositioning
  const handleDragEnd = useCallback((eventId: string, deltaQuarters: number) => {
    const event = events.find(e => e.id === eventId);
    if (!event || deltaQuarters === 0 || !onUpdateEvent) return;

    const { startDate: newStart, endDate: newEnd } = shiftEventDates(event, deltaQuarters);
    if (newStart === event.startDate && newEnd === event.endDate) return;

    onUpdateEvent({ ...event, startDate: newStart, endDate: newEnd });
  }, [events, onUpdateEvent]);

  const { dragState, handlePointerDown, justDraggedRef } = useEventDrag(scale, scrollContainerRef, handleDragEnd);

  // Handle bulk-add scroll target from EventTableEditor
  useEffect(() => {
    if (pendingScrollDate) {
      requestAnimationFrame(() => {
        scrollToDate(pendingScrollDate);
        onScrollComplete?.();
      });
    }
  }, [pendingScrollDate, scrollToDate, onScrollComplete]);

  // Calculate stacks and heights for each category
  const categoryData = React.useMemo(() => {
    let currentOffset = 0;
    const data = visibleCategories.map(category => {
      const categoryEvents = visibleEvents.filter(event => event.category === category.id);
      const stackedEvents = calculateEventStacks(categoryEvents, months, scale.monthWidth);
      const maxStack = Math.max(...stackedEvents.map(event => event.stackIndex), 0);
      
      const height = (maxStack + 1) * EVENT_HEIGHT + CATEGORY_PADDING;

      const result = {
        id: category.id,
        height: Math.max(height, CATEGORY_MIN_HEIGHT),
        offset: currentOffset,
        events: stackedEvents,
      };

      currentOffset += result.height;
      return result;
    });

    return {
      categories: data,
      totalHeight: currentOffset || CATEGORY_MIN_HEIGHT,
    };
  }, [visibleEvents, visibleCategories, months, scale.monthWidth]);

  const handleMonthClick = useCallback((monthIndex: number) => {
    if (!onAddEvent || justDraggedRef.current) return;

    const clickedMonth = months[monthIndex];
    if (clickedMonth) {
      const date = new Date(clickedMonth.year, clickedMonth.month, 1);
      setSelectedDate(date.toISOString().split('T')[0]);
      setEditingEvent(null);
      setShowEventModal(true);
    }
  }, [months, onAddEvent, justDraggedRef]);

  const handleEventClick = useCallback((event: ITimelineEvent) => {
    if (!onUpdateEvent || justDraggedRef.current) return;
    setEditingEvent(event);
    setSelectedDate(null);
    setShowEventModal(true);
  }, [onUpdateEvent, justDraggedRef]);

  const handleSubmit = useCallback((eventData: Omit<ITimelineEvent, 'id'>) => {
    if (editingEvent) {
      onUpdateEvent?.({ ...eventData, id: editingEvent.id });
    } else {
      onAddEvent?.(eventData);
    }
    setShowEventModal(false);
    setEditingEvent(null);
    setSelectedDate(null);

    requestAnimationFrame(() => {
      scrollToDate(eventData.startDate);
    });
  }, [editingEvent, onAddEvent, onUpdateEvent, scrollToDate]);

  return (
    <div className={isFullScreen ? 'h-[calc(100vh-6rem)]' : 'relative mb-16'}>
      <div
        className="absolute left-0 z-10 pointer-events-none"
        style={{ top: SCROLL_INDICATOR_HEIGHT + HEADER_HEIGHT, height: categoryData.totalHeight }}
      >
        <TimelineCategoryLabels
          categories={categoryData.categories}
          customCategories={visibleCategories}
        />
      </div>

      <div className="relative">
        <TimelineScrollIndicator
          months={months}
          visibleRange={visibleRange}
        />
        <div className="overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto scrollbar-hide"
          >
            <div 
              className="relative timeline-grid transition-all duration-200 ease-in-out"
              style={{ 
                display: 'grid',
                gridTemplateColumns: `repeat(${months.length * 4}, ${scale.quarterWidth}px)`,
                minWidth: `${months.length * scale.monthWidth}px`,
                cursor: onAddEvent ? 'pointer' : 'default'
              }}
            >
              <TimelineHeader months={months} scale={scale} />
              {categoryData.categories.map((category) => (
                <div 
                  key={`category-${category.id}`}
                  className="relative border-l border-[#171717]"
                  style={{ 
                    height: category.height,
                    gridColumn: `1 / span ${months.length * 4}`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${months.length * 4}, ${scale.quarterWidth}px)`,
                    gridAutoRows: `${EVENT_HEIGHT}px`,
                    gap: 0,
                  }}
                >
                  <TimelineGrid 
                    months={months} 
                    height={category.height}
                    onMonthHover={setHoveredMonth}
                    onMonthClick={handleMonthClick}
                    scale={scale}
                  />
                  {category.events.map((event) => (
                    <TimelineEvent
                      key={event.id}
                      event={event}
                      months={months}
                      categoryOffset={category.offset}
                      categoryColor={visibleCategories.find(c => c.id === category.id)?.color}
                      onEventClick={onUpdateEvent ? handleEventClick : undefined}
                      scale={scale}
                      isDragging={dragState.isDragging && dragState.draggedEventId === event.id}
                      dragDeltaPixels={dragState.draggedEventId === event.id ? dragState.deltaPixels : 0}
                      onPointerDown={onUpdateEvent ? handlePointerDown : undefined}
                    />
                  ))}
                </div>
              ))}

              {/* Filler row: extends vertical grid lines to bottom of viewport */}
              <div
                className="relative border-l border-[#171717]"
                style={{
                  gridColumn: `1 / span ${months.length * 4}`,
                  minHeight: `calc(100vh - ${categoryData.totalHeight + HEADER_HEIGHT + SCROLL_INDICATOR_HEIGHT}px - 6rem)`,
                }}
              >
                <TimelineGrid
                  months={months}
                  onMonthHover={setHoveredMonth}
                  onMonthClick={handleMonthClick}
                  scale={scale}
                />
              </div>

              {/* Add Event Cursor — hidden during drag */}
              {hoveredMonth !== null && onAddEvent && !dragState.isDragging && (
                <div
                  className="absolute top-[64px] bottom-0 bg-[#FBFBFB]/25 pointer-events-none transition-transform duration-75 ease-out"
                  style={{
                    transform: `translateX(${hoveredMonth * scale.monthWidth}px)`,
                    width: `${scale.monthWidth}px`,
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {!isFullScreen && (
          <TimelineOverview
            months={months}
            events={visibleEvents}
            visibleRange={visibleRange}
            categories={visibleCategories}
            scale={scale}
          />
        )}
      </div>

      {/* Event Dialog */}
      <Dialog
        open={showEventModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowEventModal(false);
            setEditingEvent(null);
            setSelectedDate(null);
          }
        }}
      >
        <DialogContent className="bg-gray-800 border-gray-700 max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {editingEvent ? 'Edit Event' : 'Add New Event'}
            </DialogTitle>
          </DialogHeader>
          <EventForm
            onSubmit={handleSubmit}
            categories={visibleCategories}
            initialStartDate={selectedDate}
            initialEvent={editingEvent}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}