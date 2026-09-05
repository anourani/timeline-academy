import { memo } from 'react';
import { Month, TimelineScale } from '../../types/timeline';

interface TimelineGridProps {
  months: Month[];
  height?: number;
  onMonthHover?: (monthIndex: number | null) => void;
  onMonthClick?: (monthIndex: number) => void;
  scale: TimelineScale;
}

export const TimelineGrid = memo(function TimelineGrid({
  months,
  height,
  onMonthHover,
  onMonthClick,
  scale
}: TimelineGridProps) {
  return (
    <div
      // `transition-[height]`, not `transition-all`: `height` is the only prop
      // that animates here, and this node carries one grid track per month —
      // asking the engine to watch every animatable property on it costs real
      // time per frame on a long timeline.
      className="absolute inset-0 pointer-events-none grid transition-[height] duration-200 ease-in-out"
      style={{
        ...(height !== undefined && { height }),
        gridTemplateColumns: `repeat(${months.length}, ${scale.monthWidth}px)`,
      }}
    >
      {months.map((month, index) => (
        <div
          key={`${month.year}-${month.month}`}
          className="relative"
          onMouseEnter={() => onMonthHover?.(index)}
          onMouseLeave={() => onMonthHover?.(null)}
          onClick={() => onMonthClick?.(index)}
          style={{ pointerEvents: 'auto' }}
        />
      ))}
    </div>
  );
});
