import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { TimelineHeader } from './TimelineHeader';
import { TimelineGrid } from './TimelineGrid';
import { TimelineVerticalLines } from './TimelineVerticalLines';
import { TimelineCategoryLabels } from './TimelineCategoryLabels';
import { TimelineEvent } from './TimelineEvent';
import { TimelineScrollIndicator } from './TimelineScrollIndicator';
import { EventHoverCursor, EventHoverCursorHandle } from './EventHoverCursor';
import { TimelineEvent as ITimelineEvent, CategoryConfig } from '../../types/event';
import { TimelineScale, TimelineVerticalScale } from '../../types/timeline';
import { formatYMD, getTimelineRange, shiftEventDates } from '../../utils/dateUtils';
import { calculateEventStacks, StackedEvent } from '../../utils/eventStacking';
import { useTimelineScroll } from '../../hooks/useTimelineScroll';
import { useEventDrag } from '../../hooks/useEventDrag';
import { CATEGORY_PADDING, CATEGORY_MIN_HEIGHT, SCROLL_INDICATOR_HEIGHT, HEADER_HEIGHT } from '../../constants/timeline';
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
  /** Called whenever an event is clicked, in either mode — it opens the detail
   *  side panel. There is no longer an actions menu on the click path. */
  onOpenDetails?: (event: ITimelineEvent) => void;
  scale: TimelineScale;
  verticalScale: TimelineVerticalScale;
  groupByCategory?: boolean;
  pendingScrollDate?: string | null;
  onScrollComplete?: () => void;
  /** Id of an event the page wants edited — set by the detail panel's Edit
   *  action, which lives outside this subtree but needs the EventForm dialog
   *  this component owns. Cleared via `onEditRequestHandled`, mirroring the
   *  `pendingScrollDate` / `onScrollComplete` pair above. */
  pendingEditEventId?: string | null;
  onEditRequestHandled?: () => void;
  /**
   * Edit/View mode. In view mode, edit affordances (drag-to-reschedule,
   * hover-to-add cursor, click-to-edit) are suppressed.
   */
  mode?: 'edit' | 'view';
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
  onOpenDetails,
  scale,
  verticalScale,
  groupByCategory = false,
  pendingScrollDate,
  onScrollComplete,
  pendingEditEventId,
  onEditRequestHandled,
  mode = 'edit',
}: TimelineProps) {
  const isEditing = mode === 'edit';
  // Filter visible categories and their events. Memoized because `months` and
  // `layout` below key off these arrays: rebuilding them every render meant the
  // `layout` memo never hit, so the whole stacking pass — including canvas text
  // measurement per event — re-ran on every render. That is affordable for a
  // 96-month range and is not for the ~3,700 months a 17th-century timeline
  // legitimately spans.
  const visibleCategories = useMemo(
    () => categories.filter(cat => cat.visible),
    [categories]
  );
  const visibleEvents = useMemo(
    () => events.filter(event =>
      visibleCategories.some(cat => cat.id === event.category)
    ),
    [events, visibleCategories]
  );

  const { months } = useMemo(() => getTimelineRange(visibleEvents), [visibleEvents]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<ITimelineEvent | null>(null);
  const [pendingScrollEventId, setPendingScrollEventId] = useState<string | null>(null);
  // Only flips when the pointer enters or leaves an event, never per move, so
  // the hover cursor costs at most two renders per event crossed.
  const [isOverEvent, setIsOverEvent] = useState(false);

  const gridContentRef = useRef<HTMLDivElement>(null);
  const hoverCursorRef = useRef<EventHoverCursorHandle>(null);
  const hoveredEventIdRef = useRef<string | null>(null);

  const { visibleRange } = useTimelineScroll(scrollContainerRef, months.length * 4);

  // Translate vertical wheel into smooth horizontal scroll. A rAF loop lerps
  // scrollLeft toward an accumulated target so fast ticks glide instead of
  // jumping. Scoped to the container ref so wheel events inside side panels
  // and dialogs (rendered outside this subtree) keep their native vertical scroll.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    let target = el.scrollLeft;
    let rafId: number | null = null;

    const step = () => {
      const current = el.scrollLeft;
      const diff = target - current;
      if (Math.abs(diff) < 0.5) {
        el.scrollLeft = target;
        rafId = null;
        return;
      }
      el.scrollLeft = current + diff * 0.18;
      rafId = requestAnimationFrame(step);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.deltaY === 0) return;

      e.preventDefault();

      // Normalize line/page delta modes to pixels.
      const delta =
        e.deltaMode === 1 ? e.deltaY * 16
        : e.deltaMode === 2 ? e.deltaY * el.clientHeight
        : e.deltaY;

      const maxScroll = el.scrollWidth - el.clientWidth;
      if (rafId === null) target = el.scrollLeft;
      target = Math.max(0, Math.min(maxScroll, target + delta));

      if (rafId === null) rafId = requestAnimationFrame(step);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

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

        const height = (maxStack + 1) * verticalScale.eventHeight + CATEGORY_PADDING;

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
      ? verticalScale.eventRowHeight
      : (maxStack + 1) * verticalScale.eventRowHeight + CATEGORY_PADDING;

    return {
      bands: [{ id: 'all', height, offset: 0, events: stackedEvents }],
      totalHeight: height,
    };
  }, [groupByCategory, visibleEvents, visibleCategories, months, scale.monthWidth, verticalScale.eventHeight, verticalScale.eventRowHeight]);

  const handleMonthClick = useCallback((monthIndex: number) => {
    if (!isEditing || !onAddEvent || justDraggedRef.current) return;

    const clickedMonth = months[monthIndex];
    if (clickedMonth) {
      // Built from the parts directly: `new Date(y, m, 1).toISOString()` shifts
      // to the previous day west of UTC, and coerces a year below 100 into
      // 19xx.
      setSelectedDate(formatYMD(clickedMonth.year, clickedMonth.month, 1));
      setEditingEvent(null);
      setShowEventModal(true);
    }
  }, [months, onAddEvent, justDraggedRef, isEditing]);

  // One click, one outcome, in both modes: open the detail panel. The panel
  // itself handles cached content vs. fresh generation. Edit and Delete now
  // live in the panel's header rather than on the click path.
  const handleEventClick = useCallback(
    (event: ITimelineEvent) => {
      if (justDraggedRef.current) return;
      onOpenDetails?.(event);
    },
    [justDraggedRef, onOpenDetails],
  );

  // The detail panel's Edit action reaches the EventForm dialog through here —
  // the panel is mounted by the page, outside this subtree.
  useEffect(() => {
    if (!pendingEditEventId) return;
    const target = events.find(e => e.id === pendingEditEventId);
    if (target) {
      setEditingEvent(target);
      setSelectedDate(null);
      setShowEventModal(true);
    }
    onEditRequestHandled?.();
  }, [pendingEditEventId, events, onEditRequestHandled]);

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

  // --- Hover cursor (concept 3a) -----------------------------------------
  // One delegated listener on the grid container regardless of event count.
  // `closest('[data-event-id]')` resolves the hovered event; the cursor is
  // then driven imperatively, so a move never re-renders anything.

  const clearHoverCursor = useCallback(() => {
    hoverCursorRef.current?.hide();
    if (hoveredEventIdRef.current !== null) {
      hoveredEventIdRef.current = null;
      setIsOverEvent(false);
    }
  }, []);

  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Touch and pen get no custom cursor — there is no hover to express.
      if (e.pointerType !== 'mouse') return;
      // During a drag the native `cursor: grabbing` is the affordance.
      if (dragState.isDragging) {
        clearHoverCursor();
        return;
      }

      const target = e.target as Element | null;
      const eventEl = target?.closest?.('[data-event-id]') as HTMLElement | null;
      if (!eventEl) {
        clearHoverCursor();
        return;
      }

      const content = gridContentRef.current;
      if (!content) return;
      const rect = content.getBoundingClientRect();
      hoverCursorRef.current?.move(
        e.clientX - rect.left,
        e.clientY - rect.top,
        eventEl.dataset.eventColor || '#666',
      );

      const id = eventEl.dataset.eventId ?? null;
      if (hoveredEventIdRef.current !== id) {
        hoveredEventIdRef.current = id;
        setIsOverEvent(true);
      }
    },
    [dragState.isDragging, clearHoverCursor],
  );

  const handleGridPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const target = e.target as Element | null;
    if (!target?.closest?.('[data-event-id]')) return;
    hoverCursorRef.current?.setPressed(true);
  }, []);

  const handleGridPointerUp = useCallback(() => {
    hoverCursorRef.current?.setPressed(false);
  }, []);

  // Coarse pointers get one 44px bloom at the tap point as launch feedback
  // instead of a cursor that follows nothing.
  const handleGridPointerDownCoarse = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') return;
      const target = e.target as Element | null;
      const eventEl = target?.closest?.('[data-event-id]') as HTMLElement | null;
      const content = gridContentRef.current;
      if (!eventEl || !content) return;
      const rect = content.getBoundingClientRect();
      hoverCursorRef.current?.bloom(
        e.clientX - rect.left,
        e.clientY - rect.top,
        eventEl.dataset.eventColor || '#666',
      );
    },
    [],
  );

  // A drag starting under the cursor must take it away immediately, not on the
  // next move — otherwise the plus disc rides along with the grabbed event.
  useEffect(() => {
    if (dragState.isDragging) clearHoverCursor();
  }, [dragState.isDragging, clearHoverCursor]);

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
  const rowHeight = groupByCategory ? verticalScale.eventHeight : verticalScale.eventRowHeight;

  return (
    <div className={isFullScreen ? 'h-[calc(100vh-6rem)] relative' : 'flex-1 min-h-0 flex flex-col relative'}>
      {showCategoryLabels && (
        <div
          className="absolute left-0 z-10 pointer-events-none"
          style={{ top: SCROLL_INDICATOR_HEIGHT + HEADER_HEIGHT, height: layout.totalHeight, transition: 'height 220ms ease' }}
        >
          <TimelineCategoryLabels
            categories={layout.bands.map(b => ({ id: b.id, height: b.height }))}
            customCategories={visibleCategories}
          />
        </div>
      )}

      <div className="relative flex-1 min-h-0 flex flex-col">
        <TimelineScrollIndicator
          months={months}
          visibleRange={visibleRange}
        />
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-auto scrollbar-hide"
        >
          <div
            ref={gridContentRef}
            className="relative timeline-grid transition-[min-width] duration-200 ease-in-out flex flex-col"
            style={{
              minWidth: `${months.length * scale.monthWidth}px`,
              minHeight: '100%',
              cursor: isEditing && onAddEvent ? 'pointer' : 'default'
            }}
            onPointerMove={handleGridPointerMove}
            onPointerLeave={clearHoverCursor}
            onPointerDown={(e) => {
              handleGridPointerDown(e);
              handleGridPointerDownCoarse(e);
            }}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerUp}
          >
            <TimelineHeader months={months} scale={scale} />
            <div className="relative flex-1 min-h-0 flex flex-col">
              <TimelineVerticalLines
                months={months}
                scale={scale}
                scrollContainerRef={scrollContainerRef}
              />
              {layout.bands.map((band) => (
                <div
                  key={`band-${band.id}`}
                  className="relative shrink-0"
                  style={{
                    height: band.height,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${months.length * 4}, ${scale.quarterWidth}px)`,
                    ['--event-row-height' as string]: `${rowHeight}px`,
                    gridAutoRows: 'var(--event-row-height)',
                    gap: 0,
                    transition: 'height 220ms ease, --event-row-height 220ms ease',
                  }}
                >
                  <TimelineGrid
                    months={months}
                    height={band.height}
                    onMonthHover={setHoveredMonth}
                    onMonthClick={handleMonthClick}
                    scale={scale}
                  />
                  {band.events.map((event) => {
                    // Same in both modes now — a click always opens details.
                    const canHandleClick = !!onOpenDetails;
                    return (
                      <TimelineEvent
                        key={event.id}
                        event={event}
                        months={months}
                        categoryOffset={band.offset}
                        categoryColor={visibleCategories.find(c => c.id === event.category)?.color}
                        onEventClick={canHandleClick ? handleEventClick : undefined}
                        scale={scale}
                        isDragging={dragState.isDragging && dragState.draggedEventId === event.id}
                        dragDeltaPixels={dragState.draggedEventId === event.id ? dragState.deltaPixels : 0}
                        onPointerDown={isEditing && onUpdateEvent ? handlePointerDown : undefined}
                        rowHeight={rowHeight}
                        onMounted={handleEventMounted}
                      />
                    );
                  })}
                </div>
              ))}

              {/* Filler: extends the body through remaining vertical space.
                  flex-1 lets it fill the scroll container when events are short,
                  and the whole grid scrolls vertically when they aren't. */}
              <div className="relative flex-1 min-h-0">
                <TimelineGrid
                  months={months}
                  onMonthHover={setHoveredMonth}
                  onMonthClick={handleMonthClick}
                  scale={scale}
                />
              </div>
            </div>

            {/* Add Event Cursor — hidden during drag, in view mode, and while
                the pointer is over an event, so the "add here" band and the
                "open this" cursor never appear at the same time. */}
            {hoveredMonth !== null && isEditing && onAddEvent && !dragState.isDragging && !isOverEvent && (
              <div
                className="absolute top-[64px] bottom-0 bg-[#FBFBFB]/25 pointer-events-none transition-transform duration-75 ease-out"
                style={{
                  transform: `translateX(${hoveredMonth * scale.monthWidth}px)`,
                  width: `${scale.monthWidth}px`,
                }}
              />
            )}

            {/* Event hover cursor — last child so it paints above the grid and
                every event. Every part is pointer-events: none. */}
            <EventHoverCursor ref={hoverCursorRef} />
          </div>
        </div>
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
