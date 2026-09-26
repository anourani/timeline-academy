import { memo } from 'react';
import { TimelineYearLabels } from './TimelineYearLabels';
import { TimelineMonthLabels } from './TimelineMonthLabels';
import { Month, TimelineScale } from '../../types/timeline';

interface TimelineHeaderProps {
  /** Plays the axis-assembly animation on the labels. */
  intro?: boolean;
  /** Leftmost visible month index and year at the parked scroll position,
   *  so both label rows stagger from where the user is actually looking. */
  introFirstVisible?: number;
  introFirstVisibleYear?: number | null;
  months: Month[];
  scale: TimelineScale;
}

export const TimelineHeader = memo(function TimelineHeader({
  months,
  scale,
  intro = false,
  introFirstVisible = 0,
  introFirstVisibleYear = null,
}: TimelineHeaderProps) {
  return (
    <div 
      className="grid transition-[grid-template-columns] duration-200 ease-in-out"
      style={{ gridTemplateColumns: `repeat(${months.length}, ${scale.monthWidth}px)` }}
    >
      <TimelineYearLabels
        months={months}
        scale={scale}
        intro={intro}
        introFirstVisibleYear={introFirstVisibleYear}
      />
      <TimelineMonthLabels
        months={months}
        scale={scale}
        intro={intro}
        introFirstVisible={introFirstVisible}
      />
    </div>
  );
});
