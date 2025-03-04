import React from 'react';
import { TimelineEvent } from '../../types/event';
import { getTimelineYearRange } from '../../utils/timelineUtils';
import { DEFAULT_TIMELINE_DESCRIPTION } from '../../constants/defaults';

interface TimelineTitleProps {
  title: string;
  description: string;
  events: TimelineEvent[];
}

export function TimelineTitle({ 
  title, 
  description,
  events
}: TimelineTitleProps) {
  const timelineRange = getTimelineYearRange(events);
  const displayDescription = description || DEFAULT_TIMELINE_DESCRIPTION;

  return (
    <div className="flex-1 max-w-[800px] p-[24px_40px_32px_24px] bg-dark rounded-2xl">
      <div className="text-gray-400 text-sm mb-1">
        {timelineRange}
      </div>
      <h1 className="text-[48px] text-[#FBFBFB]">
        {title}
      </h1>
      <p className="text-base text-gray-300 mt-2">
        {displayDescription}
      </p>
    </div>
  );
}