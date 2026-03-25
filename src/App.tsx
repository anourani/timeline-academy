import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { GlobalNav } from '@/components/Navigation/GlobalNav';
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
    title, description, setTitle, setDescription,
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
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const { isGenerating, error: aiError, generate } = useAIMode();
  const { loadAllDrafts, loadDraft, saveDraft, saveDraftImmediate, createDraft, clearAllDrafts } = useLocalDraft();
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
      const routeState = location.state as {
        newTimeline?: boolean;
        skipCreationScreen?: boolean;
        draftId?: string;
        timelineId?: string;
      } | null;

      if (routeState?.newTimeline) {
        // "Build from Scratch" or "Build with AI" — always start a new timeline
        const newDraft = createDraft();
        if (!newDraft) {
          alert('You\'ve reached the 3-timeline limit. Delete an existing timeline to create a new one.');
          routerNavigate('/', { replace: true });
          setDraftHydrated(true);
          return;
        }
        setActiveDraftId(newDraft.id);
        setTitle(newDraft.title);
        setDescription(newDraft.description);
        setEvents(newDraft.events);
        updateCategories(newDraft.categories);
        handleScaleChange(newDraft.scale);
        if (!routeState.skipCreationScreen) {
          setShowCreationScreen(true);
        }
      } else if (routeState?.draftId) {
        // Clicking a local draft tile on Homepage
        const draft = loadDraft(routeState.draftId);
        if (draft) {
          setActiveDraftId(draft.id);
          setTitle(draft.title);
          setDescription(draft.description);
          setEvents(draft.events);
          updateCategories(draft.categories);
          handleScaleChange(draft.scale);
        } else {
          setShowCreationScreen(true);
        }
      } else {
        // No route state — load most recent draft or show creation screen
        const allDrafts = loadAllDrafts();
        if (allDrafts.length > 0) {
          const mostRecent = allDrafts[0];
          setActiveDraftId(mostRecent.id);
          setTitle(mostRecent.title);
          setDescription(mostRecent.description);
          setEvents(mostRecent.events);
          updateCategories(mostRecent.categories);
          handleScaleChange(mostRecent.scale);
        } else {
          setShowCreationScreen(true);
        }
      }

      setDraftHydrated(true);
      // Clear the route state so refreshing doesn't re-trigger
      routerNavigate('/editor', { replace: true, state: {} });
    }
  }, [user, draftHydrated]);

  // Save to localStorage when logged out
  useEffect(() => {
    if (!user && draftHydrated && activeDraftId) {
      saveDraft({
        id: activeDraftId,
        title,
        description,
        events,
        categories,
        scale: currentScale.value,
        savedAt: new Date().toISOString()
      });
    }
  }, [user, draftHydrated, activeDraftId, title, description, events, categories, currentScale.value]);

  // Migrate localStorage drafts to Supabase on login
  useEffect(() => {
    if (user && draftHydrated) {
      const allDrafts = loadAllDrafts();
      const draftsWithEvents = allDrafts.filter(d => d.events.length > 0);

      if (draftsWithEvents.length > 0) {
        (async () => {
          for (const draft of draftsWithEvents) {
            try {
              await saveTimeline(draft.title, draft.events, draft.scale);
            } catch (err: unknown) {
              if (err instanceof Error && err.message === 'Maximum limit of 3 timelines reached') {
                alert('You\'ve reached the 3-timeline limit. Some drafts couldn\'t be saved. Delete an existing timeline to make room.');
                break;
              } else {
                console.error('Failed to migrate draft:', err);
              }
            }
          }
          clearAllDrafts();
          setActiveDraftId(null);
        })();
      } else {
        clearAllDrafts();
        setActiveDraftId(null);
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
    } else if (activeDraftId) {
      // Flush current state to localStorage synchronously so the new tab can read it
      saveDraftImmediate({
        id: activeDraftId,
        title, description, events, categories,
        scale: currentScale.value,
        savedAt: new Date().toISOString()
      });
      window.open(`/view/local?draftId=${activeDraftId}`, '_blank');
    }
  };

  const handleClearTimeline = () => {
    clearEvents();
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
        variant="timeline"
        onPresentMode={handlePresentMode}
        timelineId={timelineId}
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
