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
import { calculateEventStacks, StackedEvent } from '../../utils/eventStacking';
import { useTimelineScroll } from '../../hooks/useTimelineScroll';
import { useEventDrag } from '../../hooks/useEventDrag';
import { EVENT_HEIGHT, EVENT_ROW_HEIGHT, CATEGORY_PADDING, CATEGORY_MIN_HEIGHT, SCROLL_INDICATOR_HEIGHT, HEADER_HEIGHT } from '../../constants/timeline';
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
  onAddEvent?: (event: Omit<ITimelineEvent, 'id'>) => ITimelineEvent | void;
  onUpdateEvent?: (event: ITimelineEvent) => void;
  scale: TimelineScale;
  groupByCategory?: boolean;
  pendingScrollDate?: string | null;
  onScrollComplete?: () => void;
}

interface CategoryBand {
  id: string;
  height: number;
  offset: number;
  events: StackedEvent[];
}

interface LayoutData {
  bands: CategoryBand[];
  totalHeight: number;
}

export function Timeline({
  events,
  categories,
  isFullScreen,
  onAddEvent,
  onUpdateEvent,
  scale,
  groupByCategory = false,
  pendingScrollDate,
  onScrollComplete
}: TimelineProps) {
  // Filter visible categories and their events
  const visibleCategories = categories.filter(cat => cat.visible);
  const visibleEvents = events.filter(event =>
    visibleCategories.some(cat => cat.id === event.category)
  );

  const { months } = getTimelineRange(visibleEvents);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<ITimelineEvent | null>(null);
  const [pendingScrollEventId, setPendingScrollEventId] = useState<string | null>(null);

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

  // Compute layout: either one band per visible category (grouped mode)
  // or a single band containing all visible events (default).
  const layout = React.useMemo<LayoutData>(() => {
    if (groupByCategory) {
      let currentOffset = 0;
      const bands: CategoryBand[] = visibleCategories.map(category => {
        const categoryEvents = visibleEvents.filter(event => event.category === category.id);
        const stackedEvents = calculateEventStacks(categoryEvents, months, scale.monthWidth);
        const maxStack = Math.max(...stackedEvents.map(event => event.stackIndex), 0);

        const height = (maxStack + 1) * EVENT_HEIGHT + CATEGORY_PADDING;

        const band: CategoryBand = {
          id: category.id,
          height: Math.max(height, CATEGORY_MIN_HEIGHT),
          offset: currentOffset,
          events: stackedEvents,
        };

        currentOffset += band.height;
        return band;
      });

      return {
        bands,
        totalHeight: currentOffset || CATEGORY_MIN_HEIGHT,
      };
    }

    // Default: single global stacking pass.
    const stackedEvents = calculateEventStacks(visibleEvents, months, scale.monthWidth);
    const maxStack = Math.max(...stackedEvents.map(event => event.stackIndex), 0);
    const height = stackedEvents.length === 0
      ? EVENT_ROW_HEIGHT
      : (maxStack + 1) * EVENT_ROW_HEIGHT + CATEGORY_PADDING;

    return {
      bands: [{ id: 'all', height, offset: 0, events: stackedEvents }],
      totalHeight: height,
    };
  }, [groupByCategory, visibleEvents, visibleCategories, months, scale.monthWidth]);

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
    let newEventId: string | null = null;
    if (editingEvent) {
      onUpdateEvent?.({ ...eventData, id: editingEvent.id });
    } else {
      const newEvent = onAddEvent?.(eventData);
      if (newEvent && typeof newEvent === 'object' && 'id' in newEvent) {
        newEventId = newEvent.id;
      }
    }
    setShowEventModal(false);
    setEditingEvent(null);
    setSelectedDate(null);

    requestAnimationFrame(() => {
      scrollToDate(eventData.startDate);
    });

    if (newEventId) {
      // Defer until after the next layout pass so the event has a stackIndex
      // and rendered DOM node we can scroll to.
      setPendingScrollEventId(newEventId);
    }
  }, [editingEvent, onAddEvent, onUpdateEvent, scrollToDate]);

  const handleEventMounted = useCallback((eventId: string, node: HTMLDivElement | null) => {
    if (!node) return;
    if (eventId === pendingScrollEventId) {
      // scrollIntoView handles vertical scroll on the page; horizontal scroll
      // is handled separately by scrollToDate.
      node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      setPendingScrollEventId(null);
    }
  }, [pendingScrollEventId]);

  const showCategoryLabels = groupByCategory;
  const rowHeight = groupByCategory ? EVENT_HEIGHT : EVENT_ROW_HEIGHT;

  return (
    <div className={isFullScreen ? 'h-[calc(100vh-6rem)]' : 'relative'}>
      {showCategoryLabels && (
        <div
          className="absolute left-0 z-10 pointer-events-none"
          style={{ top: SCROLL_INDICATOR_HEIGHT + HEADER_HEIGHT, height: layout.totalHeight }}
        >
          <TimelineCategoryLabels
            categories={layout.bands.map(b => ({ id: b.id, height: b.height }))}
            customCategories={visibleCategories}
          />
        </div>
      )}

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
              {layout.bands.map((band) => (
                <div
                  key={`band-${band.id}`}
                  className="relative border-l border-[#171717]"
                  style={{
                    height: band.height,
                    gridColumn: `1 / span ${months.length * 4}`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${months.length * 4}, ${scale.quarterWidth}px)`,
                    gridAutoRows: `${rowHeight}px`,
                    gap: 0,
                  }}
                >
                  <TimelineGrid
                    months={months}
                    height={band.height}
                    onMonthHover={setHoveredMonth}
                    onMonthClick={handleMonthClick}
                    scale={scale}
                  />
                  {band.events.map((event) => (
                    <TimelineEvent
                      key={event.id}
                      event={event}
                      months={months}
                      categoryOffset={band.offset}
                      categoryColor={visibleCategories.find(c => c.id === event.category)?.color}
                      onEventClick={onUpdateEvent ? handleEventClick : undefined}
                      scale={scale}
                      isDragging={dragState.isDragging && dragState.draggedEventId === event.id}
                      dragDeltaPixels={dragState.draggedEventId === event.id ? dragState.deltaPixels : 0}
                      onPointerDown={onUpdateEvent ? handlePointerDown : undefined}
                      rowHeight={rowHeight}
                      onMounted={handleEventMounted}
                    />
                  ))}
                </div>
              ))}

              {/* Filler row: extends vertical grid lines to bottom of viewport */}
              <div
                className="relative border-l border-[#171717]"
                style={{
                  gridColumn: `1 / span ${months.length * 4}`,
                  minHeight: `calc(100vh - ${layout.totalHeight + HEADER_HEIGHT + SCROLL_INDICATOR_HEIGHT}px - 6rem)`,
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
        <DialogContent className="bg-surface-secondary border-[rgba(210,210,210,0.15)] max-w-[360px] rounded-[20px] px-5 py-6">
          <DialogHeader>
            <DialogTitle className="header-small text-[#c9ced4] text-center">
              {editingEvent ? 'Edit Event' : 'Add Event'}
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
