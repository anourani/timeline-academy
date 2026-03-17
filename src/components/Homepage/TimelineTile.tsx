import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Share2, Copy, Trash2 } from 'lucide-react';
import { DEFAULT_TIMELINE_TITLE } from '../../constants/defaults';

interface TimelineTileProps {
  id: string;
  title: string;
  eventCount: number;
  yearRange: string;
  onClick: () => void;
  onShare: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TimelineTile({ id, title, eventCount, yearRange, onClick, onShare, onDuplicate, onDelete }: TimelineTileProps) {
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
    <div className="w-full flex items-center bg-surface-secondary hover:bg-[#1e1e1e] rounded-xl transition-all duration-200 ease-out">
      <button
        onClick={onClick}
        className="flex-1 text-left px-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-l-xl"
      >
        <div className="flex items-center justify-between">
          <span className="font-aleo font-normal text-[16px] text-text-primary">
            {title || DEFAULT_TIMELINE_TITLE}
          </span>
          <div className="flex items-center gap-6 font-mono text-xs font-light text-text-tertiary">
            {yearRange && <span>{yearRange}</span>}
            <span>{eventCount} {eventCount === 1 ? 'event' : 'events'}</span>
          </div>
        </div>
      </button>

      <div className="relative pr-3" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="p-2 text-text-tertiary hover:text-text-primary rounded-md transition-colors"
        >
          <MoreVertical size={18} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-40 bg-surface-tertiary border border-[#3D3E40] rounded-lg shadow-lg z-50 py-1">
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
