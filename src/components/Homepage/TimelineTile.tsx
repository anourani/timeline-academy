import { DEFAULT_TIMELINE_TITLE } from '../../constants/defaults';

interface TimelineTileProps {
  title: string;
  eventCount: number;
  yearRange: string;
  onClick: () => void;
}

export function TimelineTile({ title, eventCount, yearRange, onClick }: TimelineTileProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[#1A1A1A] text-white hover:bg-[#252525] active:bg-[#151515] rounded-xl px-5 py-6 transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-base">
          {title || DEFAULT_TIMELINE_TITLE}
        </span>
        <div className="flex items-center gap-4 font-mono text-xs font-light text-gray-400">
          <span>{eventCount} {eventCount === 1 ? 'event' : 'events'}</span>
          {yearRange && <span>{yearRange}</span>}
        </div>
      </div>
    </button>
  );
}
