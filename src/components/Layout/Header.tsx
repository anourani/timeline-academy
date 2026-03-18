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
  onAuthClick: (isSignUp: boolean) => void;
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
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAddEventClick = () => {
    setActivePanel(null);
    setShowAddEventModal(true);
  };

  const handleAddEventSubmit = (event: Omit<TimelineEvent, 'id'>) => {
    onAddEvent(event);
    setShowAddEventModal(false);
  };

  const handleAuthClick = (signUp: boolean) => {
    setIsSignUp(signUp);
    setShowAuthModal(true);
  };

  const timelineRange = getTimelineYearRange(events);

  return (
    <>
      <header>
        <div className="flex items-start px-10 md:px-20 py-12 relative">
          {/* Left: Title with vertical divider */}
          <div className="flex items-center gap-3 pr-2 shrink-0">
            <div className="w-0.5 h-[120px] bg-[#3d3e40]" />
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="bg-transparent text-[32px] leading-[1.25] text-[#dadee5] font-['Aleo'] font-normal border-none outline-none focus:outline-none caret-white min-w-0"
                style={{ width: `${Math.max(title.length, 1)}ch` }}
              />
              <div className="flex items-center gap-8 font-['JetBrains_Mono'] font-light text-sm leading-[1.4] text-[#c9ced4]">
                <span>{events.length} {events.length === 1 ? 'event' : 'events'}</span>
                <span>{timelineRange}</span>
              </div>
            </div>
          </div>

          {/* Center: Timeline controls */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
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
        defaultIsSignUp={isSignUp}
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
      />
    </>
  );
}
