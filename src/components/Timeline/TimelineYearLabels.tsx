import { memo } from 'react';
import { Month, TimelineScale } from '../../types/timeline';
import { getUniqueYears } from '../../utils/timelineUtils';

interface TimelineYearLabelsProps {
  months: Month[];
  scale: TimelineScale;
  /** Fades the cells in and lifts the year into place. */
  intro?: boolean;
  /** The first year visible at the parked scroll position, so the stagger
   *  starts where the user is looking. */
  introFirstVisibleYear?: number | null;
}

const INTRO_YEAR_MS = 400;
/** Last of the three axis passes: lines, then months, then years. */
const INTRO_YEAR_START_MS = 600;
const INTRO_YEAR_STAGGER_MS = 70;

export const TimelineYearLabels = memo(function TimelineYearLabels({
  months,
  scale,
  intro = false,
  introFirstVisibleYear = null,
}: TimelineYearLabelsProps) {
  const years = getUniqueYears(months);

  const introYearStyle = (year: number) => {
    if (!intro) return undefined;
    const base = introFirstVisibleYear ?? years[0] ?? year;
    const yv = year - base;
    if (yv < 0) return undefined;
    return {
      animation: `timeline-intro-rise-in ${INTRO_YEAR_MS}ms var(--ease-enter) ${
        INTRO_YEAR_START_MS + yv * INTRO_YEAR_STAGGER_MS
      }ms both`,
    };
  };
  
  return (
    <div 
      className="border-l border-line-default relative h-8 transition-[width] duration-200 ease-in-out"
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
            data-timeline-intro={intro ? '' : undefined}
            className="shrink-0 border-r border-line-year-boundary relative transition-[width] duration-200 ease-in-out"
            style={{
              width: `${monthsInYear * scale.monthWidth}px`,
              ...introYearStyle(year),
            }}
          >
            <div className="absolute left-0 right-0 top-0 text-sm text-[#9b9ea3] text-center font-mono transition-transform duration-200 ease-in-out">
              {year}
            </div>
          </div>
        );
      })}
    </div>
  );
});
