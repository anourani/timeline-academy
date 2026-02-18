import React from 'react';
import { Columns3, Layers, Settings } from 'lucide-react';

interface FloatingToolbarProps {
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
        relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
        transition-all duration-200 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
        ${isActive
          ? 'bg-white/15 text-white'
          : 'text-gray-300 hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95 active:bg-white/5'
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
        flex flex-col items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium
        transition-all duration-200 ease-out
        ${isActive ? 'text-white' : 'text-gray-400'}
      `}
    >
      {icon}
      {label}
    </button>
  );
}

export function FloatingToolbar({
  onEventsClick,
  onCategoriesClick,
  onSettingsClick,
  activePanel
}: FloatingToolbarProps) {
  return (
    <>
      {/* Desktop: Floating pill toolbar */}
      <div className="sticky top-[44px] z-30 hidden md:flex justify-center py-3">
        <div className="inline-flex items-center gap-1 px-2 py-1.5 bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] animate-toolbar-in">
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
      <div className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden justify-around items-center px-4 pt-2 pb-6 bg-white/10 backdrop-blur-xl border-t border-white/15">
        <MobileToolbarButton
          icon={<Columns3 size={22} />}
          label="Events"
          isActive={activePanel === 'events'}
          onClick={onEventsClick}
        />
        <MobileToolbarButton
          icon={<Layers size={22} />}
          label="Categories"
          isActive={activePanel === 'categories'}
          onClick={onCategoriesClick}
        />
        <MobileToolbarButton
          icon={<Settings size={22} />}
          label="Settings"
          isActive={activePanel === 'settings'}
          onClick={onSettingsClick}
        />
      </div>
    </>
  );
}
