import React, { memo } from 'react';
import { Month } from '../../types/timeline';
import { TimelineEvent, CategoryConfig } from '../../types/event';

interface TimelineOverviewProps {
  months: Month[];
  events: TimelineEvent[];
  categories: CategoryConfig[];
  visibleRange: {
    start: number;
    end: number;
  };
}

export const TimelineOverview = memo(function TimelineOverview({ 
  months, 
  events, 
  categories,
  visibleRange 
}: TimelineOverviewProps) {
  if (months.length < 600) return null;

  const totalYears = Math.ceil(months.length / 12);
  const pixelsPerYear = 4;
  const width = totalYears * pixelsPerYear;
  
  const visibleStartX = (visibleRange.start / months.length) * width;
  const visibleWidth = ((visibleRange.end - visibleRange.start) / months.length) * width;

  const firstYear = months[0].year;
  const lastYear = months[months.length - 1].year;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/90 rounded-lg p-3 backdrop-blur-sm">
      <div className="relative" style={{ width: `${width}px`, height: '24px' }}>
        {events.map((event) => {
          const startDate = new Date(event.startDate);
          const endDate = new Date(event.endDate);
          const startYear = startDate.getFullYear();
          const endYear = endDate.getFullYear();
          
          const category = categories.find(c => c.id === event.category);
          if (!category) return null;

          const left = ((startYear - months[0].year) * pixelsPerYear);
          const eventWidth = Math.max(
            ((endYear - startYear) * pixelsPerYear) || 2,
            2
          );

          return (
            <div
              key={event.id}
              className="absolute h-1 rounded-full"
              style={{
                backgroundColor: category.color,
                left: `${left}px`,
                width: `${eventWidth}px`,
                top: `${(events.indexOf(event) % 3) * 6 + 6}px`,
                opacity: 0.7,
              }}
            />
          );
        })}

        <div
          className="absolute h-full bg-white/20 border border-white/40 rounded"
          style={{
            left: `${visibleStartX}px`,
            width: `${visibleWidth}px`,
          }}
        />

        <div className="absolute top-0 h-full border-l border-gray-600/30">
          <span className="absolute -top-5 -translate-x-1/2 text-xs text-gray-400">
            {firstYear}
          </span>
        </div>
        <div 
          className="absolute top-0 h-full border-l border-gray-600/30"
          style={{ left: `${width}px` }}
        >
          <span className="absolute -top-5 -translate-x-1/2 text-xs text-gray-400">
            {lastYear}
          </span>
        </div>
      </div>
    </div>
  );
});