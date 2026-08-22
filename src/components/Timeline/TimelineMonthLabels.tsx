import React from 'react';
import { format } from 'date-fns';
import { Month, TimelineScale } from '../../types/timeline';
import { getMonthBorderClass } from '../../utils/timelineUtils';

// Only the month name is rendered, but `new Date(y, m)` coerces a year below
// 100 into 19xx, so the year is pinned rather than taken from the month.
const MONTH_LABEL_REFERENCE_YEAR = 2000;

interface TimelineMonthLabelsProps {
  months: Month[];
  scale: TimelineScale;
}

export function TimelineMonthLabels({ months, scale }: TimelineMonthLabelsProps) {
  return (
    <div 
      className="border-l border-line-default transition-[grid-template-columns] duration-200 ease-in-out"
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
            <span className="text-[10px] text-[#9b9ea3] font-mono transition-transform duration-200 ease-in-out">
              {format(new Date(MONTH_LABEL_REFERENCE_YEAR, month.month), 'MMM')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}