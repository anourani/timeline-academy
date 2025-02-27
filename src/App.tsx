import React, { useState, useEffect } from 'react';
import { Header } from './components/Layout/Header';
import { GlobalNav } from './components/Header/GlobalNav';
import { TimelineContainer } from './components/Timeline/TimelineContainer';
import { SampleTimelineView } from './components/SampleTimeline/SampleTimelineView';
import { useEvents } from './hooks/useEvents';
import { useTimelineTitle } from './hooks/useTimelineTitle';
import { useTimelineChanges } from './hooks/useTimelineChanges';
import { useTimeline } from './hooks/useTimeline';
import { useTimelineScale } from './hooks/useTimelineScale';
import { useAuth } from './contexts/AuthContext';
import { useCategories } from './hooks/useCategories';
import { useAutosave } from './hooks/useAutosave';
import { AuthModal } from './components/Auth/AuthModal';
import { UnsavedChangesModal } from './components/Modal/UnsavedChangesModal';
import { TimelineEvent } from './types/event';

export function App() {
  const { events, addEvent, addEvents, clearEvents, setEvents, updateEvent } = useEvents();
  const { title, description, setTitle, setDescription, resetTitle } = useTimelineTitle();
  const { categories, updateCategories, resetCategories } = useCategories();
  const { scale, currentScale, handleScaleChange } = useTimelineScale();
  const { user } = useAuth();
  const { saveTimeline, timelineId, loadTimeline } = useTimeline();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSampleTimeline, setShowSampleTimeline] = useState(false);
  const [pendingSwitchTimelineId, setPendingSwitchTimelineId] = useState<string | null>(null);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(false);

  const timelineData = {
    id: timelineId,
    title,
    description,
    events,
    categories,
    scale: currentScale.value
  };

  const { saveStatus, lastSavedTime, handleChange } = useAutosave(timelineData);

  useEffect(() => {
    const handleOpenAuthModal = (e: CustomEvent<{ isSignUp: boolean }>) => {
      setIsSignUp(e.detail.isSignUp);
      setShowAuthModal(true);
    };

    window.addEventListener('open-auth-modal', handleOpenAuthModal as EventListener);
    return () => {
      window.removeEventListener('open-auth-modal', handleOpenAuthModal as EventListener);
    };
  }, []);

  // Trigger autosave when timeline data changes
  useEffect(() => {
    if (timelineId) {
      handleChange(timelineData);
    }
  }, [timelineId, title, description, events, categories, currentScale.value]);

  const handleTimelineSwitch = async (newTimelineId: string) => {
    if (saveStatus === 'saving') {
      setPendingSwitchTimelineId(newTimelineId);
      setShowUnsavedChangesModal(true);
      return;
    }

    await switchTimeline(newTimelineId);
  };

  const switchTimeline = async (newTimelineId: string) => {
    try {
      // Reset all state before loading new timeline
      clearEvents();
      resetTitle();
      resetCategories();

      const { title: newTitle, description: newDescription, events: newEvents, categories: newCategories, scale: newScale } = await loadTimeline(newTimelineId);
      
      setTitle(newTitle);
      setDescription(newDescription || '');
      setEvents(newEvents);
      if (newCategories) {
        updateCategories(newCategories);
      }
      handleScaleChange(newScale || 'large');
    } catch (error) {
      console.error('Error switching timeline:', error);
      alert('Failed to load timeline. Please try again.');
    }
  };

  const handleDiscardAndSwitch = async () => {
    if (pendingSwitchTimelineId) {
      await switchTimeline(pendingSwitchTimelineId);
      setPendingSwitchTimelineId(null);
      setShowUnsavedChangesModal(false);
    }
  };

  const handleSaveAndSwitch = async () => {
    try {
      // Wait for current save to complete
      if (pendingSwitchTimelineId) {
        await switchTimeline(pendingSwitchTimelineId);
        setPendingSwitchTimelineId(null);
      }
    } finally {
      setShowUnsavedChangesModal(false);
    }
  };

  const handleUpdateEvent = (updatedEvent: TimelineEvent) => {
    updateEvent(updatedEvent);
  };

  return (
    <div className="app-container min-h-screen bg-black text-white overflow-auto">
      <GlobalNav 
        onViewTimelinesClick={() => setShowSidePanel(true)}
        onSignInClick={() => {
          setIsSignUp(false);
          setShowAuthModal(true);
        }}
        onSignUpClick={() => {
          setIsSignUp(true);
          setShowAuthModal(true);
        }}
        timelineId={timelineId}
      />
      <Header
        title={title} 
        description={description}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onAddEvent={addEvent}
        onImportEvents={addEvents}
        onClearTimeline={clearEvents}
        events={events}
        timelineId={timelineId}
        onTimelineSwitch={handleTimelineSwitch}
        categories={categories}
        onCategoriesChange={updateCategories}
        onEventsChange={setEvents}
        showSidePanel={showSidePanel}
        onCloseSidePanel={() => setShowSidePanel(false)}
        scale={scale}
        onScaleChange={handleScaleChange}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
      />
      <TimelineContainer 
        events={events} 
        categories={categories} 
        onAddEvent={addEvent}
        onUpdateEvent={handleUpdateEvent}
        scale={currentScale}
      />
      <SampleTimelineView 
        isOpen={showSampleTimeline}
        onClose={() => setShowSampleTimeline(false)}
      />
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultIsSignUp={isSignUp}
      />
      <UnsavedChangesModal
        isOpen={showUnsavedChangesModal}
        onClose={() => {
          setShowUnsavedChangesModal(false);
          setPendingSwitchTimelineId(null);
        }}
        onDiscard={handleDiscardAndSwitch}
        onSave={handleSaveAndSwitch}
      />
    </div>
  );
}