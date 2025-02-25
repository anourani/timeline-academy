import React from 'react';
import { TimelineEvent } from './TimelineEvent';
import { calculateEventStacks } from '../../utils/eventStacking';
import { TimelineEvent as ITimelineEvent } from '../../types/event';
import { Month } from '../../types/timeline';

interface TimelineCategoryEventsProps {
  events: ITimelineEvent[];
  months: Month[];
  categoryHeight: number;
}

export function TimelineCategoryEvents({ events, months, categoryHeight }: TimelineCategoryEventsProps) {
  const stackedEvents = calculateEventStacks(events);

  return (
    <>
      {stackedEvents.map((event) => (
        <TimelineEvent
          key={event.id}
          event={event}
          months={months}
          categoryHeight={categoryHeight}
        />
      ))}
    </>
  );
}