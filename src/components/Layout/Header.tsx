import React, { useState } from 'react';
import { SaveStatusIndicator } from '../SaveStatusIndicator/SaveStatusIndicator';
import { SidePanel } from '../SidePanel/SidePanel';
import { TimelineSettingsPanel } from '../Settings/TimelineSettingsPanel';
import { EventTableEditor } from '../EventTableEditor/EventTableEditor';
import { CategoriesPanel } from '../Categories/CategoriesPanel';
import { FloatingToolbar } from '../FloatingToolbar/FloatingToolbar';
import { EventForm } from '../EventForm/EventForm';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
import { getTimelineYearRange } from '../../utils/timelineUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SaveStatus } from '../SaveStatusIndicator/SaveStatusIndicator';
import type { AddEventsResult } from '../../hooks/useEvents';

interface HeaderProps {
  title: string;
  description: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onAddEvent: (event: Omit<TimelineEvent, 'id'>) => void;
  onImportEvents: (events: Omit<TimelineEvent, 'id'>[]) => AddEventsResult;
  onClearTimeline: () => void;
  events: TimelineEvent[];
  timelineId: string | null;
  onTimelineSwitch: (timelineId: string) => void;
  categories: CategoryConfig[];
  onCategoriesChange: (categories: CategoryConfig[]) => void;
  onEventsChange: (events: TimelineEvent[]) => void;
  showSidePanel: boolean;
  onCloseSidePanel: () => void;
  onAuthClick: () => void;
  scale: 'large' | 'small';
  onScaleChange: (scale: 'large' | 'small') => void;
  saveStatus: SaveStatus;
  lastSavedTime?: Date;
}

export function Header({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  onAddEvent,
  onImportEvents,
  onClearTimeline,
  events,
  timelineId,
  onTimelineSwitch,
  categories,
  onCategoriesChange,
  onEventsChange,
  showSidePanel,
  onCloseSidePanel,
  onAuthClick,
  scale,
  onScaleChange,
  saveStatus,
  lastSavedTime
}: HeaderProps) {
  const [activePanel, setActivePanel] = useState<'events' | 'categories' | 'settings' | null>(null);
  const { user } = useAuth();

  const togglePanel = (panel: 'events' | 'categories' | 'settings') => {
    setActivePanel(prev => prev === panel ? null : panel);
  };

  const closePanel = () => setActivePanel(null);
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleAddEventClick = () => {
    setActivePanel(null);
    setShowAddEventModal(true);
  };

  const handleAddEventSubmit = (event: Omit<TimelineEvent, 'id'>) => {
    onAddEvent(event);
    setShowAddEventModal(false);
  };


  const timelineRange = getTimelineYearRange(events);

  return (
    <>
      <header>
        <div className="flex items-start px-4 py-3 md:px-6 md:py-10 relative">
          {/* Left: Title with vertical divider */}
          <div className="flex items-center gap-3 pr-2 shrink-0">
            <div className="w-0.5 h-[100px] md:h-[110px] bg-[#3d3e40]" />
            <div className="flex flex-col gap-1 md:gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="bg-transparent text-[32px] leading-[1.25] text-[#c9ced4] font-['Aleo'] font-normal border-none outline-none focus:outline-none caret-white min-w-0"
                style={{ width: `${Math.max(title.length, 1)}ch` }}
              />
              <div className="flex items-center gap-6 stats-m text-[#9b9ea3]">
                <span>{events.length} {events.length === 1 ? 'event' : 'events'}</span>
                <span>{timelineRange}</span>
              </div>
            </div>
          </div>

          {/* Center: Timeline controls */}
          <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <FloatingToolbar
              onAddEventClick={handleAddEventClick}
              onEventsClick={() => togglePanel('events')}
              onCategoriesClick={() => togglePanel('categories')}
              onSettingsClick={() => togglePanel('settings')}
              activePanel={activePanel}
            />
          </div>

          {/* Right: Save status */}
          <div className="ml-auto shrink-0">
            <SaveStatusIndicator status={saveStatus} lastSaved={lastSavedTime} />
          </div>
        </div>
      </header>

      {/* Mobile: toolbar rendered outside header for clean fixed positioning */}
      <div className="md:hidden">
        <FloatingToolbar
          onAddEventClick={handleAddEventClick}
          onEventsClick={() => togglePanel('events')}
          onCategoriesClick={() => togglePanel('categories')}
          onSettingsClick={() => togglePanel('settings')}
          activePanel={activePanel}
        />
      </div>

      <Dialog open={showAddEventModal} onOpenChange={setShowAddEventModal}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              Add New Event
            </DialogTitle>
          </DialogHeader>
          <EventForm
            onSubmit={handleAddEventSubmit}
            categories={categories.filter(c => c.visible)}
          />
        </DialogContent>
      </Dialog>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      <SidePanel
        isOpen={showSidePanel}
        onClose={onCloseSidePanel}
        timelineId={timelineId}
        onTimelineSwitch={onTimelineSwitch}
        onAuthClick={onAuthClick}
      />

      <TimelineSettingsPanel
        isOpen={activePanel === 'settings'}
        onClose={closePanel}
        events={events}
        timelineTitle={title}
        timelineDescription={description}
        onImportEvents={onImportEvents}
        onClearTimeline={onClearTimeline}
        onTitleChange={onTitleChange}
        onDescriptionChange={onDescriptionChange}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
        scale={scale}
        onScaleChange={onScaleChange}
      />

      <CategoriesPanel
        isOpen={activePanel === 'categories'}
        onClose={closePanel}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
      />

      <EventTableEditor
        isOpen={activePanel === 'events'}
        onClose={closePanel}
        events={events}
        onEventsChange={onEventsChange}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
      />
    </>
  );
}
