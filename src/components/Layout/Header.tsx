import React, { useState } from 'react';
import { Settings, Columns3, Layers } from 'lucide-react';
import { TimelineTitle } from '../TimelineTitle/TimelineTitle';
import { SaveStatusIndicator } from '../SaveStatusIndicator/SaveStatusIndicator';
import { SidePanel } from '../SidePanel/SidePanel';
import { TimelineSettingsPanel } from '../Settings/TimelineSettingsPanel';
import { EventTableEditor } from '../EventTableEditor/EventTableEditor';
import { CategoriesPanel } from '../Categories/CategoriesPanel';
import { useSidePanel } from '../../hooks/useSidePanel';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
import type { SaveStatus } from '../SaveStatusIndicator/SaveStatusIndicator';

interface HeaderProps {
  title: string;
  description: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onAddEvent: (event: Omit<TimelineEvent, 'id'>) => void;
  onImportEvents: (events: Omit<TimelineEvent, 'id'>[]) => void;
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
  const { isOpen: isSettingsOpen, open: openSettings, close: closeSettings } = useSidePanel();
  const { isOpen: isCategoriesOpen, open: openCategories, close: closeCategories } = useSidePanel();
  const [showTableEditor, setShowTableEditor] = useState(false);
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuthClick = (signUp: boolean) => {
    setIsSignUp(signUp);
    setShowAuthModal(true);
  };

  return (
    <>
      <header>
        <div className="pl-[32px] pr-8 pt-12 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <TimelineTitle 
              title={title} 
              description={description}
              events={events}
            />
            <div className="flex-shrink-0">
              <SaveStatusIndicator status={saveStatus} lastSaved={lastSavedTime} />
            </div>
          </div>
        </div>

        <div className="pl-[32px] pr-8 py-1">
          <div className="flex gap-3 justify-end items-center">
            <button
              onClick={() => setShowTableEditor(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              <Columns3 size={20} />
              Events
            </button>
            <button
              onClick={openCategories}
              className="flex items-center gap-2 bg-transparent text-white px-4 py-2 rounded-md transition-colors border-2 border-gray-700 hover:border-gray-600"
            >
              <Layers size={20} />
              Categories
            </button>
            <button
              onClick={openSettings}
              className="flex items-center gap-2 bg-transparent text-white px-4 py-2 rounded-md transition-colors border-2 border-gray-700 hover:border-gray-600"
            >
              <Settings size={20} />
              Settings
            </button>
          </div>
        </div>
      </header>

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
        isOpen={isSettingsOpen}
        onClose={closeSettings}
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
        isOpen={isCategoriesOpen}
        onClose={closeCategories}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
      />

      <EventTableEditor
        isOpen={showTableEditor}
        onClose={() => setShowTableEditor(false)}
        events={events}
        onEventsChange={onEventsChange}
        categories={categories}
      />
    </>
  );
}