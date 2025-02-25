import React, { useState } from 'react';
import { Settings, Table2 } from 'lucide-react';
import { TimelineTitle } from '../TimelineTitle/TimelineTitle';
import { AddEventButton } from '../AddEventButton/AddEventButton';
import { SaveButton } from '../SaveButton/SaveButton';
import { SidePanel } from '../SidePanel/SidePanel';
import { TimelineSettingsPanel } from '../Settings/TimelineSettingsPanel';
import { EventTableEditor } from '../EventTableEditor/EventTableEditor';
import { useSidePanel } from '../../hooks/useSidePanel';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';

interface HeaderProps {
  title: string;
  description: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onAddEvent: (event: Omit<TimelineEvent, 'id'>) => void;
  onImportEvents: (events: Omit<TimelineEvent, 'id'>[]) => void;
  onClearTimeline: () => void;
  events: TimelineEvent[];
  hasChanges: boolean;
  onSave: () => void;
  timelineId: string | null;
  onTimelineSwitch: (timelineId: string) => void;
  categories: CategoryConfig[];
  onCategoriesChange: (categories: CategoryConfig[]) => void;
  onEventsChange: (events: TimelineEvent[]) => void;
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
  hasChanges,
  onSave,
  timelineId,
  onTimelineSwitch,
  categories,
  onCategoriesChange,
  onEventsChange
}: HeaderProps) {
  const { isOpen: isMenuOpen, open: openMenu, close: closeMenu } = useSidePanel();
  const { isOpen: isSettingsOpen, open: openSettings, close: closeSettings } = useSidePanel();
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
      <div className="bg-black border-b border-gray-800">
        <div className="mx-auto px-8 py-2 flex justify-between items-center">
          <div>
            <button
              onClick={openMenu}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              View Timelines
            </button>
          </div>
          <div className="text-sm">
            {!user ? (
              <>
                <button
                  onClick={() => handleAuthClick(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Sign in
                </button>
                <span className="text-gray-600 mx-2">or</span>
                <button
                  onClick={() => handleAuthClick(true)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Create an account
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <header className="timeline-header pl-[120px] pr-8 pb-16 pt-12">
        <div className="timeline-header-content flex justify-between items-start pb-8">
          <TimelineTitle 
            title={title} 
            description={description}
            onTitleChange={onTitleChange}
            onDescriptionChange={onDescriptionChange}
          />
          <div className="timeline-header-actions flex gap-3">
            <AddEventButton onAddEvent={onAddEvent} categories={categories} />
            <button
              onClick={() => setShowTableEditor(true)}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              <Table2 size={20} />
              Edit Content
            </button>
            <button
              onClick={openSettings}
              className="timeline-settings-button flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              <Settings size={20} />
              Settings
            </button>
            <SaveButton hasChanges={hasChanges} onSave={onSave} />
          </div>
        </div>
      </header>

      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultIsSignUp={isSignUp}
      />

      <SidePanel 
        isOpen={isMenuOpen} 
        onClose={closeMenu} 
        timelineId={timelineId}
        onTimelineSwitch={onTimelineSwitch}
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