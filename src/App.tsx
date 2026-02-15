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
  const { saveTimeline, timelineId, loadTimeline, error: timelineError, retryInitialLoad } = useTimeline();
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

  const handleAuthClick = (signUp: boolean) => {
    setIsSignUp(signUp);
    setShowAuthModal(true);
  };

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
      // Load new data first — don't clear state until we have the replacement
      const { title: newTitle, description: newDescription, events: newEvents, categories: newCategories, scale: newScale } = await loadTimeline(newTimelineId);

      // Only update state after successful load
      setTitle(newTitle);
      setDescription(newDescription || '');
      setEvents(newEvents);
      if (newCategories) {
        updateCategories(newCategories);
      } else {
        resetCategories();
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
        onAuthClick={handleAuthClick}
        scale={scale}
        onScaleChange={handleScaleChange}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
      />
      {timelineError ? (
        <div className="flex items-center justify-center py-20">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full text-center">
            <p className="text-red-400 mb-4">{timelineError}</p>
            <button
              onClick={retryInitialLoad}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <TimelineContainer
          events={events}
          categories={categories}
          onAddEvent={addEvent}
          onUpdateEvent={handleUpdateEvent}
          scale={currentScale}
        />
      )}
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