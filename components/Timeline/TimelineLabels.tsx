import React from 'react';
import { format } from 'date-fns';

interface TimelineLabelsProps {
  startDate: Date;
  endDate: Date;
}

export function TimelineLabels({ startDate, endDate }: TimelineLabelsProps) {
  const years = [];
  const currentYear = new Date(startDate);
  
  while (currentYear <= endDate) {
    years.push(new Date(currentYear));
    currentYear.setFullYear(currentYear.getFullYear() + 1);
  }

  return (
    <div className="flex border-l border-gray-700 h-8">
      {years.map((year, index) => (
        <div
          key={year.getTime()}
          className="flex-1 border-r border-gray-700 relative"
        >
          <div className="absolute -left-2 top-0 text-sm text-gray-400">
            {format(year, 'yyyy')}
          </div>
          <div className="grid grid-cols-12 h-full">
            {Array.from({ length: 12 }).map((_, monthIndex) => (
              <div
                key={monthIndex}
                className="border-r border-gray-700 text-[10px] text-gray-500"
              >
                {format(new Date(year.getFullYear(), monthIndex), 'MMM')}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}