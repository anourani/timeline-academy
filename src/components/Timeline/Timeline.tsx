import React, { useRef, useState, useCallback } from 'react';
import { TimelineHeader } from './TimelineHeader';
import { TimelineGrid } from './TimelineGrid';
import { TimelineCategoryLabels } from './TimelineCategoryLabels';
import { TimelineEvent } from './TimelineEvent';
import { TimelineScrollIndicator } from './TimelineScrollIndicator';
import { TimelineOverview } from './TimelineOverview';
import { TimelineEvent as ITimelineEvent, CategoryConfig } from '../../types/event';
import { TimelineScale } from '../../types/timeline';
import { getTimelineRange } from '../../utils/dateUtils';
import { calculateEventStacks } from '../../utils/eventStacking';
import { useTimelineScroll } from '../../hooks/useTimelineScroll';
import { Modal } from '../Modal/Modal';
import { EventForm } from '../EventForm/EventForm';

interface TimelineProps {
  events: ITimelineEvent[];
  categories: CategoryConfig[];
  isFullScreen?: boolean;
  onAddEvent?: (event: Omit<ITimelineEvent, 'id'>) => void;
  onUpdateEvent?: (event: ITimelineEvent) => void;
  scale: TimelineScale;
}

export function Timeline({ 
  events, 
  categories, 
  isFullScreen,
  onAddEvent,
  onUpdateEvent,
  scale
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
  
  const { 
    scrollLeft, 
    containerWidth, 
    contentWidth,
    visibleRange 
  } = useTimelineScroll(scrollContainerRef, months.length * 4);
  
  // Calculate stacks and heights for each category
  const categoryData = React.useMemo(() => {
    let currentOffset = 0;
    const data = visibleCategories.map(category => {
      const categoryEvents = visibleEvents.filter(event => event.category === category.id);
      const stackedEvents = calculateEventStacks(categoryEvents, months);
      const maxStack = Math.max(...stackedEvents.map(event => event.stackIndex), 0);
      
      const EVENT_HEIGHT = 36;
      const STACK_SPACING = 0;
      const CATEGORY_PADDING = 8;
      
      const height = (maxStack + 1) * (EVENT_HEIGHT + STACK_SPACING) + CATEGORY_PADDING;
      
      const result = {
        id: category.id,
        height: Math.max(height, 80), // Changed from 72 to 80
        offset: currentOffset,
        events: stackedEvents,
      };
      
      currentOffset += result.height;
      return result;
    });

    return {
      categories: data,
      totalHeight: currentOffset || 80, // Changed from 72 to 80
    };
  }, [visibleEvents, visibleCategories, months]);

  const handleMonthClick = useCallback((monthIndex: number) => {
    if (!onAddEvent) return;
    
    const clickedMonth = months[monthIndex];
    if (clickedMonth) {
      const date = new Date(clickedMonth.year, clickedMonth.month, 1);
      setSelectedDate(date.toISOString().split('T')[0]);
      setEditingEvent(null);
      setShowEventModal(true);
    }
  }, [months, onAddEvent]);

  const handleEventClick = useCallback((event: ITimelineEvent) => {
    if (!onUpdateEvent) return;
    setEditingEvent(event);
    setSelectedDate(null);
    setShowEventModal(true);
  }, [onUpdateEvent]);

  const handleSubmit = useCallback((eventData: Omit<ITimelineEvent, 'id'>) => {
    if (editingEvent) {
      onUpdateEvent?.({ ...eventData, id: editingEvent.id });
    } else {
      onAddEvent?.(eventData);
    }
    setShowEventModal(false);
    setEditingEvent(null);
    setSelectedDate(null);
  }, [editingEvent, onAddEvent, onUpdateEvent]);

  return (
    <div className={isFullScreen ? 'h-[calc(100vh-6rem)]' : 'relative'}>
      <div 
        className="absolute left-0 top-[64px] w-[150px] z-10 bg-black" 
        style={{ height: categoryData.totalHeight }}
      >
        <TimelineCategoryLabels 
          categories={categoryData.categories} 
          customCategories={visibleCategories}
        />
      </div>
      
      <div className="relative">
        <div className="overflow-hidden" style={{ marginLeft: '150px' }}>
          <div 
            ref={scrollContainerRef} 
            className="overflow-x-auto scrollbar-hide"
            style={{ marginLeft: '-150px', paddingLeft: '150px' }}
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
                  className="relative border-l border-gray-700"
                  style={{ 
                    height: category.height,
                    gridColumn: `1 / span ${months.length * 4}`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${months.length * 4}, ${scale.quarterWidth}px)`,
                    gridAutoRows: '36px',
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
                    />
                  ))}
                </div>
              ))}

              {/* Add Event Cursor */}
              {hoveredMonth !== null && onAddEvent && (
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
          <>
            <TimelineScrollIndicator
              months={months}
              scrollLeft={scrollLeft}
              containerWidth={containerWidth}
              contentWidth={contentWidth}
            />
            <TimelineOverview
              months={months}
              events={visibleEvents}
              visibleRange={visibleRange}
              categories={visibleCategories}
              scale={scale}
            />
          </>
        )}
      </div>

      {/* Event Modal */}
      <Modal
        isOpen={showEventModal}
        onClose={() => {
          setShowEventModal(false);
          setEditingEvent(null);
          setSelectedDate(null);
        }}
        title={editingEvent ? 'Edit Event' : 'Add New Event'}
      >
        <EventForm 
          onSubmit={handleSubmit}
          categories={visibleCategories}
          initialStartDate={selectedDate}
          initialEvent={editingEvent}
        />
      </Modal>
    </div>
  );
}