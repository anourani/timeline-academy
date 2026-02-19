import { TimelineEvent } from '../../types/event';
import { getTimelineYearRange } from '../../utils/timelineUtils';

interface TimelineTitleProps {
  title: string;
  description: string;
  events: TimelineEvent[];
  showDescription?: boolean;
}

export function TimelineTitle({
  title,
  description,
  events,
  showDescription = false
}: TimelineTitleProps) {
  const timelineRange = getTimelineYearRange(events);
  const hasDescription = showDescription && description.trim().length > 0;

  return (
    <div className="flex items-center gap-5 py-2">
      {/* Stats column */}
      <div className="flex flex-col gap-1 shrink-0">
        <span className="font-mono text-sm font-light leading-[140%] text-gray-300">
          {timelineRange}
        </span>
        <span className="font-mono text-sm font-light leading-[140%] text-gray-300">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-[#1E1E1E]" />

      {/* Title column */}
      <h1 className="text-[48px] leading-[115%] text-[#F3F3F3] shrink-0">
        {title}
      </h1>

      {hasDescription && (
        <>
          {/* Divider */}
          <div className="w-px self-stretch bg-[#1E1E1E]" />

          {/* Description column */}
          <p className="font-mono text-xs font-light leading-[140%] text-gray-300 max-w-[560px]">
            {description}
          </p>
        </>
      )}
    </div>
  );
}