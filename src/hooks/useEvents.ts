import { useState, useCallback } from 'react';
import { TimelineEvent } from '../types/event';

export interface AddEventsResult {
  added: number;
  duplicates: number;
}

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

  const addEvents = useCallback((newEvents: Omit<TimelineEvent, 'id'>[]): AddEventsResult => {
    if (newEvents.length === 0) {
      return { added: 0, duplicates: 0 };
    }

    const eventsWithIds = newEvents.map(event => ({
      ...event,
      id: crypto.randomUUID(),
    }));

    // Dedup against current state before updating
    const currentEvents = events;
    const uniqueEvents = eventsWithIds.filter(newEvent => {
      return !currentEvents.some(existingEvent =>
        existingEvent.title === newEvent.title &&
        existingEvent.startDate === newEvent.startDate &&
        existingEvent.endDate === newEvent.endDate &&
        existingEvent.category === newEvent.category
      );
    });

    const duplicates = eventsWithIds.length - uniqueEvents.length;

    if (uniqueEvents.length > 0) {
      setEvents(prev => [...prev, ...uniqueEvents]);
    }

    return { added: uniqueEvents.length, duplicates };
  }, [events]);

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