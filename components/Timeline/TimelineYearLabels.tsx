import React from 'react';
import { Month, TimelineScale } from '../../types/timeline';
import { getUniqueYears } from '../../utils/timelineUtils';

interface TimelineYearLabelsProps {
  months: Month[];
  scale: TimelineScale;
}

export function TimelineYearLabels({ months, scale }: TimelineYearLabelsProps) {
  const years = getUniqueYears(months);
  
  return (
    <div 
      className="border-l border-gray-700 relative h-8 transition-[width] duration-200 ease-in-out"
      style={{ 
        gridColumn: `1 / span ${months.length}`,
        display: 'flex'
      }}
    >
      {years.map(year => {
        const monthsInYear = months.filter(m => m.year === year).length;
        
        return (
          <div
            key={year}
            className="border-r border-gray-700 relative transition-[width] duration-200 ease-in-out"
            style={{ 
              width: `${monthsInYear * scale.monthWidth}px`,
            }}
          >
            <div className="absolute left-0 right-0 top-0 text-sm text-gray-400 text-center font-mono transition-transform duration-200 ease-in-out">
              {year}
            </div>
          </div>
        );
      })}
    </div>
  );
}