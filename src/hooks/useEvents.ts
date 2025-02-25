import { useState, useCallback } from 'react';
import { TimelineEvent } from '../types/event';

export function useEvents() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  const addEvent = useCallback((event: Omit<TimelineEvent, 'id'>) => {
    const newEvent: TimelineEvent = {
      ...event,
      id: crypto.randomUUID(),
    };
    setEvents(prev => [...prev, newEvent]);
  }, []);

  const updateEvent = useCallback((updatedEvent: TimelineEvent) => {
    setEvents(prev => prev.map(event => 
      event.id === updatedEvent.id ? updatedEvent : event
    ));
  }, []);

  const addEvents = useCallback((newEvents: Omit<TimelineEvent, 'id'>[]) => {
    if (newEvents.length === 0) {
      console.log('No valid events to add');
      return;
    }

    console.log(`Adding ${newEvents.length} events to timeline`);
    console.log('Event sample:', newEvents[0]);
    
    const eventsWithIds = newEvents.map(event => ({
      ...event,
      id: crypto.randomUUID(),
    }));

    setEvents(prev => {
      // Filter out exact duplicates only
      const uniqueEvents = eventsWithIds.filter(newEvent => {
        const isDuplicate = prev.some(existingEvent => 
          existingEvent.title === newEvent.title &&
          existingEvent.startDate === newEvent.startDate &&
          existingEvent.endDate === newEvent.endDate &&
          existingEvent.category === newEvent.category
        );
        
        if (isDuplicate) {
          console.log(`Skipping duplicate event: ${newEvent.title}`);
        }
        
        return !isDuplicate;
      });

      if (uniqueEvents.length === 0) {
        console.log('No new events to add - all are duplicates');
        alert('All events already exist in the timeline');
        return prev;
      }

      const updatedEvents = [...prev, ...uniqueEvents];
      console.log(`Timeline now has ${updatedEvents.length} total events`);
      return updatedEvents;
    });
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { 
    events, 
    setEvents, 
    addEvent, 
    updateEvent,
    addEvents, 
    clearEvents 
  };
}