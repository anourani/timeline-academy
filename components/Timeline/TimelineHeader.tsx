import React from 'react';
import { TimelineYearLabels } from './TimelineYearLabels';
import { TimelineMonthLabels } from './TimelineMonthLabels';
import { Month, TimelineScale } from '../../types/timeline';

interface TimelineHeaderProps {
  months: Month[];
  scale: TimelineScale;
}

export function TimelineHeader({ months, scale }: TimelineHeaderProps) {
  return (
    <div 
      className="grid transition-[grid-template-columns] duration-200 ease-in-out"
      style={{ gridTemplateColumns: `repeat(${months.length}, ${scale.monthWidth}px)` }}
    >
      <TimelineYearLabels months={months} scale={scale} />
      <TimelineMonthLabels months={months} scale={scale} />
    </div>
  );
}