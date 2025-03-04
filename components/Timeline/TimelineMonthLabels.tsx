import React from 'react';
import { format } from 'date-fns';
import { Month, TimelineScale } from '../../types/timeline';

interface TimelineMonthLabelsProps {
  months: Month[];
  scale: TimelineScale;
}

export function TimelineMonthLabels({ months, scale }: TimelineMonthLabelsProps) {
  return (
    <div 
      className="border-l border-gray-700 transition-[grid-template-columns] duration-200 ease-in-out"
      style={{ 
        gridColumn: `1 / span ${months.length}`,
        display: 'grid',
        gridTemplateColumns: `repeat(${months.length}, ${scale.monthWidth}px)`
      }}
    >
      {months.map((month) => (
        <div
          key={`${month.year}-${month.month}`}
          className="border-r border-gray-700 flex items-center justify-center h-8 transition-[width] duration-200 ease-in-out"
          style={{ width: `${scale.monthWidth}px` }}
        >
          <span className="text-[10px] text-gray-500 font-mono transition-transform duration-200 ease-in-out">
            {format(new Date(month.year, month.month), 'MMM')}
          </span>
        </div>
      ))}
    </div>
  );
}