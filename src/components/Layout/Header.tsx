import React, { useState } from 'react';
import { TimelineTitle } from '../TimelineTitle/TimelineTitle';
import { SaveStatusIndicator } from '../SaveStatusIndicator/SaveStatusIndicator';
import { SidePanel } from '../SidePanel/SidePanel';
import { TimelineSettingsPanel } from '../Settings/TimelineSettingsPanel';
import { EventTableEditor } from '../EventTableEditor/EventTableEditor';
import { CategoriesPanel } from '../Categories/CategoriesPanel';
import { FloatingToolbar } from '../FloatingToolbar/FloatingToolbar';
import { Modal } from '../Modal/Modal';
import { EventForm } from '../EventForm/EventForm';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
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

  return (
    <>
      <header>
        <div className="px-[120px] pt-[40px] pb-8 flex flex-col items-center relative">
          <TimelineTitle
            title={title}
            description={description}
            events={events}
            onTitleChange={onTitleChange}
          />
          <div className="absolute right-8 top-[40px] shrink-0">
            <SaveStatusIndicator status={saveStatus} lastSaved={lastSavedTime} />
          </div>
        </div>

        <FloatingToolbar
          onAddEventClick={handleAddEventClick}
          onEventsClick={() => togglePanel('events')}
          onCategoriesClick={() => togglePanel('categories')}
          onSettingsClick={() => togglePanel('settings')}
          activePanel={activePanel}
        />
      </header>

      {showAddEventModal && (
        <Modal
          isOpen={showAddEventModal}
          onClose={() => setShowAddEventModal(false)}
          title="Add New Event"
        >
          <EventForm
            onSubmit={handleAddEventSubmit}
            categories={categories.filter(c => c.visible)}
          />
        </Modal>
      )}

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