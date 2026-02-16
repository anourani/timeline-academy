import React from 'react';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { Timeline } from './Timeline';
import { TimelineScale } from '../../types/timeline';

interface TimelineContainerProps {
  events: TimelineEvent[];
  categories: CategoryConfig[];
  onAddEvent: (event: Omit<TimelineEvent, 'id'>) => void;
  onUpdateEvent?: (event: TimelineEvent) => void;
  scale: TimelineScale;
  pendingScrollDate?: string | null;
  onScrollComplete?: () => void;
}

export function TimelineContainer({
  events,
  categories,
  onAddEvent,
  onUpdateEvent,
  scale,
  pendingScrollDate,
  onScrollComplete
}: TimelineContainerProps) {
  return (
    <main className="timeline-container relative mt-16">
      <Timeline
        events={events}
        categories={categories}
        onAddEvent={onAddEvent}
        onUpdateEvent={onUpdateEvent}
        scale={scale}
        pendingScrollDate={pendingScrollDate}
        onScrollComplete={onScrollComplete}
      />
    </main>
  );
}