import React from 'react';
import { Plus, Columns3, Layers, Settings } from 'lucide-react';

interface FloatingToolbarProps {
  onAddEventClick: () => void;
  onEventsClick: () => void;
  onCategoriesClick: () => void;
  onSettingsClick: () => void;
  activePanel: 'events' | 'categories' | 'settings' | null;
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon, label, isActive, onClick }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium
        transition-all duration-200 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
        ${isActive
          ? 'bg-[#2A2A2A] text-white'
          : 'bg-[#1A1A1A] text-white hover:bg-[#252525] active:bg-[#151515]'
        }
      `}
    >
      {icon}
      {label}
    </button>
  );
}

function MobileToolbarButton({ icon, label, isActive, onClick }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-medium
        transition-all duration-200 ease-out
        ${isActive
          ? 'bg-[#2A2A2A] text-white'
          : 'bg-[#1A1A1A] text-gray-300'
        }
      `}
    >
      {icon}
      {label}
    </button>
  );
}

export function FloatingToolbar({
  onAddEventClick,
  onEventsClick,
  onCategoriesClick,
  onSettingsClick,
  activePanel
}: FloatingToolbarProps) {
  return (
    <>
      {/* Desktop */}
      <div className="sticky top-[44px] z-30 hidden md:flex justify-center py-3">
        <div className="inline-flex items-center gap-3">
          <ToolbarButton
            icon={<Plus size={18} />}
            label="Add Event"
            isActive={false}
            onClick={onAddEventClick}
          />
          <ToolbarButton
            icon={<Columns3 size={18} />}
            label="Events"
            isActive={activePanel === 'events'}
            onClick={onEventsClick}
          />
          <ToolbarButton
            icon={<Layers size={18} />}
            label="Categories"
            isActive={activePanel === 'categories'}
            onClick={onCategoriesClick}
          />
          <ToolbarButton
            icon={<Settings size={18} />}
            label="Settings"
            isActive={activePanel === 'settings'}
            onClick={onSettingsClick}
          />
        </div>
      </div>

      {/* Mobile: Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden justify-center items-center gap-2 px-4 pt-2 pb-6 bg-black">
        <MobileToolbarButton
          icon={<Plus size={20} />}
          label="Add"
          isActive={false}
          onClick={onAddEventClick}
        />
        <MobileToolbarButton
          icon={<Columns3 size={20} />}
          label="Events"
          isActive={activePanel === 'events'}
          onClick={onEventsClick}
        />
        <MobileToolbarButton
          icon={<Layers size={20} />}
          label="Categories"
          isActive={activePanel === 'categories'}
          onClick={onCategoriesClick}
        />
        <MobileToolbarButton
          icon={<Settings size={20} />}
          label="Settings"
          isActive={activePanel === 'settings'}
          onClick={onSettingsClick}
        />
      </div>
    </>
  );
}
