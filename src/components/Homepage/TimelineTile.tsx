import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Share2, Copy, Trash2 } from 'lucide-react';
import { DEFAULT_TIMELINE_TITLE } from '../../constants/defaults';

interface TimelineTileProps {
  id: string;
  title: string;
  eventCount: number;
  yearRange: string;
  dominantCategoryColor?: string;
  onClick: () => void;
  onShare?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete: (id: string) => void;
  hideShare?: boolean;
  hideDuplicate?: boolean;
}

const DEFAULT_DOT_COLOR = '#4196E4';

export function TimelineTile({ id, title, eventCount, yearRange, dominantCategoryColor, onClick, onShare, onDuplicate, onDelete, hideShare, hideDuplicate }: TimelineTileProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div
      onClick={onClick}
      className="group w-full flex items-center py-3 md:py-[14px] px-4 rounded-[12px] bg-[#151617] hover:bg-[#242526] border border-[rgba(65,150,228,0.1)] hover:border-[rgba(65,150,228,0.25)] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] transition-all duration-200 ease-out cursor-pointer"
    >
      <div className="flex-1 flex flex-col gap-1 md:flex-row md:items-center md:gap-8 min-w-0">
        <span className="flex-1 font-aleo font-normal text-[18px] leading-[1.4] text-text-secondary group-hover:text-text-primary transition-colors truncate">
          {title || DEFAULT_TIMELINE_TITLE}
        </span>
        <div className="flex items-center gap-2 font-mono text-[12px] font-light leading-[1.4] text-text-tertiary shrink-0 w-[220px]">
          {yearRange && <span className="shrink-0 whitespace-nowrap">{yearRange}</span>}
          <div
            className="shrink-0 size-[6px] rounded-full"
            style={{ backgroundColor: dominantCategoryColor || DEFAULT_DOT_COLOR }}
          />
          <span className="w-[100px]">{eventCount} {eventCount === 1 ? 'event' : 'events'}</span>
        </div>
      </div>

      <div className="relative ml-4 md:ml-8 self-center" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="text-text-tertiary hover:text-text-primary transition-colors"
        >
          <MoreVertical className="size-5 md:size-[18px]" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-40 bg-surface-tertiary border border-[#3D3E40] rounded-lg shadow-lg z-50 py-1">
            {!hideShare && onShare && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-[#333] hover:text-text-primary transition-colors"
              >
                <Share2 size={14} />
                Share
              </button>
            )}
            {!hideDuplicate && onDuplicate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-[#333] hover:text-text-primary transition-colors"
              >
                <Copy size={14} />
                Duplicate
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-[#333] hover:text-red-300 transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
