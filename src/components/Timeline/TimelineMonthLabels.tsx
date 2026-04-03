import React from 'react';
import { format } from 'date-fns';
import { Month, TimelineScale } from '../../types/timeline';
import { getMonthBorderClass } from '../../utils/timelineUtils';

interface TimelineMonthLabelsProps {
  months: Month[];
  scale: TimelineScale;
}

export function TimelineMonthLabels({ months, scale }: TimelineMonthLabelsProps) {
  return (
    <div 
      className="border-l border-[#171717] transition-[grid-template-columns] duration-200 ease-in-out"
      style={{ 
        gridColumn: `1 / span ${months.length}`,
        display: 'grid',
        gridTemplateColumns: `repeat(${months.length}, ${scale.monthWidth}px)`
      }}
    >
      {months.map((month) => (
        <div
          key={`${month.year}-${month.month}`}
          className={`border-r ${getMonthBorderClass(month)} flex items-center justify-center h-8 transition-[width] duration-200 ease-in-out`}
          style={{ width: `${scale.monthWidth}px` }}
        >
          {scale.value === 'large' && (
            <span className="label-xs-type1 text-[#9b9ea3] transition-transform duration-200 ease-in-out">
              {format(new Date(month.year, month.month), 'MMM')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}