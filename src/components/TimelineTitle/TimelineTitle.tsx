import { TimelineEvent } from '../../types/event';
import { getTimelineYearRange } from '../../utils/timelineUtils';

interface TimelineTitleProps {
  title: string;
  description: string;
  events: TimelineEvent[];
  showDescription?: boolean;
  onTitleChange?: (title: string) => void;
}

export function TimelineTitle({
  title,
  description,
  events,
  showDescription = false,
  onTitleChange
}: TimelineTitleProps) {
  const timelineRange = getTimelineYearRange(events);
  const hasDescription = showDescription && description.trim().length > 0;
  const isEditable = !!onTitleChange;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Title pill */}
      <div className="border border-[#333] rounded-2xl px-8 py-4">
        {isEditable ? (
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="bg-transparent text-[48px] leading-[115%] text-[#F3F3F3] font-['Aleo'] font-medium tracking-[-0.01em] border-none outline-none focus:outline-none caret-white min-w-0 text-center"
            style={{ width: `${Math.max(title.length, 1)}ch` }}
          />
        ) : (
          <h1 className="text-[48px] leading-[115%] text-[#F3F3F3] text-center">
            {title}
          </h1>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-8">
        <span className="font-mono text-sm font-light leading-[140%] text-gray-300">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
        <span className="font-mono text-sm font-light leading-[140%] text-gray-300">
          {timelineRange}
        </span>
      </div>

      {hasDescription && (
        <p className="font-mono text-xs font-light leading-[140%] text-gray-300 max-w-[560px] text-center">
          {description}
        </p>
      )}
    </div>
  );
}
