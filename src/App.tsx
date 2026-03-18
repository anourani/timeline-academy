import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { GlobalNav } from './components/Header/GlobalNav';
import { Timeline } from './components/Timeline/Timeline';
import { SampleTimelineView } from './components/SampleTimeline/SampleTimelineView';
import { useTimelineState } from './hooks/useTimelineState';
import { useTimeline } from './hooks/useTimeline';
import { useAuth } from './contexts/AuthContext';
import { useAutosave } from './hooks/useAutosave';
import { AuthModal } from './components/Auth/AuthModal';
import { UnsavedChangesModal } from './components/Modal/UnsavedChangesModal';
import { useLocalDraft } from './hooks/useLocalDraft';
import { NewTimelineScreen } from './components/NewTimeline/NewTimelineScreen';
import { useAIMode } from './hooks/useAIMode';
import { TimelineEvent } from './types/event';

export function App() {
  const {
    events, addEvent, addEvents, clearEvents, setEvents, updateEvent,
    title, description, setTitle, setDescription, resetTitle,
    categories, updateCategories, resetCategories,
    scale, currentScale, handleScaleChange,
  } = useTimelineState();
  const { user } = useAuth();
  const { saveTimeline, timelineId, loadTimeline, error: timelineError, retryInitialLoad } = useTimeline();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSampleTimeline, setShowSampleTimeline] = useState(false);
  const [pendingSwitchTimelineId, setPendingSwitchTimelineId] = useState<string | null>(null);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [pendingScrollDate, setPendingScrollDate] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [showCreationScreen, setShowCreationScreen] = useState(false);
  const { isGenerating, error: aiError, generate } = useAIMode();
  const { loadDraft, saveDraft, clearDraft } = useLocalDraft();
  const handledRouteStateRef = useRef(false);

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

  // Hydrate from localStorage draft if logged out
  useEffect(() => {
    if (!user && !draftHydrated) {
      const routeState = location.state as { timelineId?: string; skipCreationScreen?: boolean } | null;
      const draft = loadDraft();
      if (draft && draft.events.length > 0) {
        setTitle(draft.title);
        setDescription(draft.description);
        setEvents(draft.events);
        updateCategories(draft.categories);
        handleScaleChange(draft.scale);
      } else if (routeState?.skipCreationScreen) {
        // "Build From Scratch" — skip creation screen, show empty timeline
      } else {
        // No draft exists — show creation screen for first-time visitors
        setShowCreationScreen(true);
      }
      setDraftHydrated(true);
      if (routeState?.timelineId) {
        routerNavigate('/editor', { replace: true, state: {} });
      }
    }
  }, [user, draftHydrated]);

  // Save to localStorage when logged out
  useEffect(() => {
    if (!user && draftHydrated) {
      saveDraft({
        title,
        description,
        events,
        categories,
        scale: currentScale.value,
        savedAt: new Date().toISOString()
      });
    }
  }, [user, draftHydrated, title, description, events, categories, currentScale.value]);

  // Migrate localStorage draft to Supabase as a new timeline on login
  useEffect(() => {
    if (user && draftHydrated) {
      const draft = loadDraft();
      if (draft && draft.events.length > 0) {
        saveTimeline(draft.title, draft.events, draft.scale)
          .then(() => {
            clearDraft();
          })
          .catch((err) => {
            if (err.message === 'Maximum limit of 3 timelines reached') {
              alert('You\'ve reached the 3-timeline limit. Your draft couldn\'t be saved. Delete an existing timeline to make room.');
            } else {
              console.error('Failed to migrate draft:', err);
              clearDraft();
            }
          });
      } else {
        clearDraft();
      }
    }
  }, [user, draftHydrated]);

  // Handle navigation from Homepage with a specific timeline to load
  useEffect(() => {
    const state = location.state as { timelineId?: string; skipCreationScreen?: boolean } | null;
    if (state?.timelineId && user && !handledRouteStateRef.current) {
      handledRouteStateRef.current = true;
      if (state.timelineId === 'new' && state.skipCreationScreen) {
        switchTimeline('new');
      } else if (state.timelineId === 'new') {
        setShowCreationScreen(true);
      } else {
        switchTimeline(state.timelineId);
      }
      // Clear the state so refreshing doesn't re-trigger
      routerNavigate('/editor', { replace: true, state: {} });
    }
  }, [location.state, user]);

  const handleTimelineSwitch = async (newTimelineId: string) => {
    if (newTimelineId === 'new') {
      setShowCreationScreen(true);
      return;
    }

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

  const handlePresentMode = () => {
    if (timelineId) {
      window.open(`/view/${timelineId}`, '_blank');
    } else {
      // Flush current state to localStorage synchronously so the new tab can read it
      try {
        localStorage.setItem('timeline_draft', JSON.stringify({
          title, description, events, categories,
          scale: currentScale.value,
          savedAt: new Date().toISOString()
        }));
      } catch {
        // Ignore storage errors
      }
      window.open('/view/local', '_blank');
    }
  };

  const handleClearTimeline = () => {
    clearEvents();
    if (!user) {
      clearDraft();
    }
  };

  const handleUpdateEvent = (updatedEvent: TimelineEvent) => {
    updateEvent(updatedEvent);
  };

  const handleManualCreate = async () => {
    setShowCreationScreen(false);
    if (user) {
      await switchTimeline('new');
    }
    // For logged-out users, just hiding the creation screen reveals the empty timeline
  };

  const handleAIGenerate = async (subject: string) => {
    try {
      const { title: genTitle, description: genDesc, events: genEvents } = await generate(subject);
      setTitle(genTitle);
      setDescription(genDesc);
      setEvents(genEvents);
      setShowCreationScreen(false);
      if (genEvents.length > 0) {
        const earliest = genEvents.reduce((a, b) => a.startDate < b.startDate ? a : b);
        setPendingScrollDate(earliest.startDate);
      }
    } catch {
      // Error is already set in useAIMode — stays on creation screen showing error
    }
  };

  const handleBulkEventsChange = (newEvents: TimelineEvent[]) => {
    const currentIds = new Set(events.map(e => e.id));
    const addedEvents = newEvents.filter(e => !currentIds.has(e.id));

    if (addedEvents.length > 0) {
      const earliest = addedEvents.reduce((a, b) =>
        a.startDate < b.startDate ? a : b
      );
      setPendingScrollDate(earliest.startDate);
    }

    setEvents(newEvents);
  };

  return (
    <div className="app-container min-h-screen bg-black text-white overflow-auto">
      <GlobalNav
        onViewTimelinesClick={() => setShowSidePanel(true)}
        onPresentMode={handlePresentMode}
        timelineId={timelineId}
        title={title}
      />
      <Header
        title={title} 
        description={description}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onAddEvent={addEvent}
        onImportEvents={addEvents}
        onClearTimeline={handleClearTimeline}
        events={events}
        timelineId={timelineId}
        onTimelineSwitch={handleTimelineSwitch}
        categories={categories}
        onCategoriesChange={updateCategories}
        onEventsChange={handleBulkEventsChange}
        showSidePanel={showSidePanel}
        onCloseSidePanel={() => setShowSidePanel(false)}
        onAuthClick={handleAuthClick}
        scale={scale}
        onScaleChange={handleScaleChange}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
      />
      {!user && events.length > 0 && !nudgeDismissed && (
        <div className="mx-4 mt-2 px-4 py-3 bg-blue-900/40 border border-blue-800/50 rounded-lg flex items-center justify-between text-sm">
          <span className="text-blue-200">
            Your work isn't saved to the cloud yet.{' '}
            <button
              onClick={() => { setIsSignUp(true); setShowAuthModal(true); }}
              className="text-blue-400 underline hover:text-blue-300"
            >
              Sign up
            </button>
            {' '}to save your timeline and access it from any device.
          </span>
          <button
            onClick={() => setNudgeDismissed(true)}
            className="text-gray-400 hover:text-white ml-4 shrink-0"
          >
            &#10005;
          </button>
        </div>
      )}
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
        <main className="timeline-container relative mt-16">
          <Timeline
            events={events}
            categories={categories}
            onAddEvent={addEvent}
            onUpdateEvent={handleUpdateEvent}
            scale={currentScale}
            pendingScrollDate={pendingScrollDate}
            onScrollComplete={() => setPendingScrollDate(null)}
          />
        </main>
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
      {showCreationScreen && (
        <NewTimelineScreen
          onAIGenerate={handleAIGenerate}
          onManualCreate={handleManualCreate}
          isGenerating={isGenerating}
          error={aiError}
        />
      )}
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