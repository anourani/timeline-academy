import React from 'react';
import { Plus, MoreVertical, Trash2, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { Timeline } from '../../types/timeline';
import { DEFAULT_TIMELINE_TITLE } from '../../constants/defaults';

interface TimelineListProps {
  timelines: Timeline[];
  activeTimelineId: string | null;
  onTimelineSelect: (timelineId: string) => void;
  onCreateTimeline: () => void;
  onDeleteTimeline?: (timelineId: string) => void;
  maxTimelines?: number;
}

export function TimelineList({
  timelines,
  activeTimelineId,
  onTimelineSelect,
  onCreateTimeline,
  onDeleteTimeline,
  maxTimelines = 3
}: TimelineListProps) {
  const availableSlots = Math.max(0, maxTimelines - timelines.length);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuId && !(event.target as Element).closest('.timeline-menu')) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId]);

  return (
    <div className="relative space-y-2">
      {timelines.map((timeline, index) => (
        <div
          key={timeline.id}
          className={`group relative rounded-md ${
            timeline.id === activeTimelineId
              ? 'bg-[#259E23] bg-opacity-20 border border-[#259E23]'
              : 'bg-gray-700/50 hover:bg-gray-700 border border-transparent hover:border-gray-600'
          }`}
          style={{
            zIndex: timelines.length - index,
            position: 'relative'
          }}
        >
          <button
            onClick={() => onTimelineSelect(timeline.id)}
            className="w-full text-left p-3 pr-12"
          >
            <div className="font-medium text-white">{timeline.title || DEFAULT_TIMELINE_TITLE}</div>
            <div className="text-xs text-gray-400 mt-1">
              {timeline.updated_at
                ? `Last saved ${format(new Date(timeline.updated_at), 'MMM d, yyyy h:mm a')}`
                : 'Not saved yet'}
            </div>
          </button>

          <div className="timeline-menu absolute right-2 top-1/2 -translate-y-1/2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuId(openMenuId === timeline.id ? null : timeline.id);
              }}
              className={`p-2 text-gray-400 hover:text-white transition-opacity rounded-full hover:bg-gray-600 ${
                timeline.id === activeTimelineId 
                  ? 'opacity-100' 
                  : 'opacity-0 group-hover:opacity-100'
              }`}
              title="More options"
            >
              <MoreVertical size={16} />
            </button>

            {/* Dropdown Menu */}
            {openMenuId === timeline.id && (
              <div 
                className="absolute right-0 top-[calc(100%+4px)]"
                style={{ 
                  zIndex: timelines.length + 1,
                  filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))'
                }}
              >
                <div className="w-36 bg-gray-800 rounded-md border border-gray-700 py-1 overflow-hidden">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(null);
                      onDeleteTimeline?.(timeline.id);
                    }}
                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-red-400 hover:bg-gray-700"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                  <button
                    disabled
                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-500 cursor-not-allowed"
                  >
                    <Share2 size={14} />
                    Share
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {availableSlots > 0 ? (
        <button
          onClick={onCreateTimeline}
          className="w-full p-3 rounded-md border border-dashed border-gray-600 hover:border-gray-500 hover:bg-gray-700/50 transition-colors"
          style={{ zIndex: 0 }}
        >
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <Plus size={18} />
            <span>Create New Timeline</span>
          </div>
        </button>
      ) : (
        <div 
          className="text-center p-3 text-sm text-gray-400 bg-gray-800/50 rounded-md border border-gray-700"
          style={{ zIndex: 0 }}
        >
          Maximum limit of {maxTimelines} timelines reached
        </div>
      )}
    </div>
  );
}