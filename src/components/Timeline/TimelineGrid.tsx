import React from 'react';
import { Month, TimelineScale } from '../../types/timeline';

interface TimelineGridProps {
  months: Month[];
  height: number;
  onMonthHover?: (monthIndex: number | null) => void;
  onMonthClick?: (monthIndex: number) => void;
  scale: TimelineScale;
}

export function TimelineGrid({ 
  months, 
  height, 
  onMonthHover, 
  onMonthClick,
  scale
}: TimelineGridProps) {
  return (
    <div 
      className="absolute inset-0 pointer-events-none grid transition-all duration-200 ease-in-out"
      style={{ 
        height,
        gridTemplateColumns: `repeat(${months.length}, ${scale.monthWidth}px)`,
      }}
    >
      {months.map((month, index) => (
        <div
          key={`${month.year}-${month.month}`}
          className="relative border-r border-gray-700"
          onMouseEnter={() => onMonthHover?.(index)}
          onMouseLeave={() => onMonthHover?.(null)}
          onClick={() => onMonthClick?.(index)}
          style={{ pointerEvents: 'auto' }}
        />
      ))}
    </div>
  );
}