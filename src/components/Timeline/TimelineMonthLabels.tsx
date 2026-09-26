import { memo } from 'react';
import { format } from 'date-fns';
import { Month, TimelineScale } from '../../types/timeline';
import { getMonthBorderClass } from '../../utils/timelineUtils';

// Only the month name is rendered, but `new Date(y, m)` coerces a year below
// 100 into 19xx, so the year is pinned rather than taken from the month.
const MONTH_LABEL_REFERENCE_YEAR = 2000;

interface TimelineMonthLabelsProps {
  months: Month[];
  scale: TimelineScale;
  /** Fades the cells in behind the axis lines. See `introCellStyle`. */
  intro?: boolean;
  /** Index of the leftmost visible month, so the stagger is keyed to the
   *  viewport rather than to the far-off start of the grid. */
  introFirstVisible?: number;
}

const INTRO_CELL_MS = 350;
/** After the lines have started arriving (300ms) and are part-way down. */
const INTRO_CELL_START_MS = 550;
const INTRO_CELL_STAGGER_MS = 8;
const INTRO_OFFSCREEN_MARGIN = 2;

export const TimelineMonthLabels = memo(function TimelineMonthLabels({
  months,
  scale,
  intro = false,
  introFirstVisible = 0,
}: TimelineMonthLabelsProps) {
  // Only cells in view are worth staggering; a wide timeline has thousands.
  const introCellStyle = (i: number) => {
    if (!intro) return undefined;
    const v = i - introFirstVisible;
    if (v < -INTRO_OFFSCREEN_MARGIN) return undefined;
    return {
      animation: `timeline-intro-fade-in ${INTRO_CELL_MS}ms var(--ease-enter) ${
        INTRO_CELL_START_MS + Math.max(v, 0) * INTRO_CELL_STAGGER_MS
      }ms both`,
    };
  };

  return (
    <div 
      className="border-l border-line-default transition-[grid-template-columns] duration-200 ease-in-out"
      style={{ 
        gridColumn: `1 / span ${months.length}`,
        display: 'grid',
        gridTemplateColumns: `repeat(${months.length}, ${scale.monthWidth}px)`
      }}
    >
      {months.map((month, i) => (
        <div
          key={`${month.year}-${month.month}`}
          data-timeline-intro={intro ? '' : undefined}
          className={`border-r ${getMonthBorderClass(month)} flex items-center justify-center h-8 transition-[width] duration-200 ease-in-out`}
          style={{ width: `${scale.monthWidth}px`, ...introCellStyle(i) }}
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
});
