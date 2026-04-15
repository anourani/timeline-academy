import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { GlobalNav } from '@/components/Navigation/GlobalNav';
import { Timeline } from './components/Timeline/Timeline';
import { SampleTimelineView } from './components/SampleTimeline/SampleTimelineView';
import { useTimelineState } from './hooks/useTimelineState';
import { useTimeline } from './hooks/useTimeline';
import { useAuth } from './contexts/AuthContext';
import { useAutosave } from './hooks/useAutosave';
import { useSidePanel } from './contexts/SidePanelContext';
import { AuthModal } from './components/Auth/AuthModal';
import { UnsavedChangesModal } from './components/Modal/UnsavedChangesModal';
import { useLocalDraft } from './hooks/useLocalDraft';
import { TimelineEvent, CategoryConfig } from './types/event';

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
  const [activePanel, setActivePanel] = useState<'events' | 'settings' | null>(null);
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [pendingScrollDate, setPendingScrollDate] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const { loadAllDrafts, loadDraft, saveDraft, saveDraftImmediate, createDraft, clearAllDrafts } = useLocalDraft();
  const handledRouteStateRef = useRef(false);
  const { setOnTimelineSelect, setOnDraftSelect, setActiveTimelineId, setActiveDraftId: setPanelActiveDraftId, setActiveTimelineTitle } = useSidePanel();

  const timelineData = {
    id: timelineId,
    title,
    description,
    events,
    categories,
    scale: currentScale.value
  };

  const { saveStatus, lastSavedTime, handleChange } = useAutosave(timelineData);

  const handleAddEventClick = () => {
    setActivePanel(null);
    setShowAddEventModal(true);
  };

  // Derive the dominant category color for the nav's status dot.
  const timelineAccentColor = useMemo(() => {
    if (events.length === 0) return '#4196E4';
    const counts = new Map<string, number>();
    for (const e of events) {
      if (e.category) counts.set(e.category, (counts.get(e.category) || 0) + 1);
    }
    let dominantId = '';
    let max = 0;
    for (const [id, count] of counts) {
      if (count > max) {
        max = count;
        dominantId = id;
      }
    }
    const category = categories.find(c => c.id === dominantId);
    return category?.color || '#4196E4';
  }, [events, categories]);

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
        aiGenerated?: {
          title: string;
          description: string;
          events: TimelineEvent[];
          categories: CategoryConfig[];
        };
      } | null;

      if (routeState?.aiGenerated) {
        // Arriving from /ai with a freshly generated timeline — create a draft
        // and seed it with the generated data.
        const newDraft = createDraft();
        if (!newDraft) {
          alert('You\'ve reached the 3-timeline limit. Delete an existing timeline to create a new one.');
          routerNavigate('/', { replace: true });
          setDraftHydrated(true);
          return;
        }
        const { title: aiTitle, description: aiDesc, events: aiEvents, categories: aiCategories } = routeState.aiGenerated;
        setActiveDraftId(newDraft.id);
        setTitle(aiTitle);
        setDescription(aiDesc);
        setEvents(aiEvents);
        updateCategories(aiCategories);
        handleScaleChange(newDraft.scale);
        if (aiEvents.length > 0) {
          const earliest = aiEvents.reduce((a, b) => a.startDate < b.startDate ? a : b);
          setPendingScrollDate(earliest.startDate);
        }
      } else if (routeState?.newTimeline && routeState.skipCreationScreen) {
        // "Build from Scratch" — create draft immediately
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
          routerNavigate('/ai', { replace: true });
          setDraftHydrated(true);
          return;
        }
      } else {
        // No route state — load most recent draft or send user to AI entry
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
          routerNavigate('/ai', { replace: true });
          setDraftHydrated(true);
          return;
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

  // Handle navigation from Homepage (or /ai) with a specific timeline to load
  useEffect(() => {
    const state = location.state as {
      timelineId?: string;
      skipCreationScreen?: boolean;
      aiGenerated?: {
        title: string;
        description: string;
        events: TimelineEvent[];
        categories: CategoryConfig[];
      };
    } | null;
    if (!user || handledRouteStateRef.current) return;

    if (state?.aiGenerated) {
      handledRouteStateRef.current = true;
      const aiData = state.aiGenerated;
      (async () => {
        // Creates the timeline row in Supabase and sets timelineId so autosave
        // will persist subsequent state updates to the new row.
        await switchTimeline('new');
        setTitle(aiData.title);
        setDescription(aiData.description);
        setEvents(aiData.events);
        updateCategories(aiData.categories);
        if (aiData.events.length > 0) {
          const earliest = aiData.events.reduce((a, b) => a.startDate < b.startDate ? a : b);
          setPendingScrollDate(earliest.startDate);
        }
      })();
      routerNavigate('/editor', { replace: true, state: {} });
    } else if (state?.timelineId) {
      handledRouteStateRef.current = true;
      if (state.timelineId === 'new' && state.skipCreationScreen) {
        switchTimeline('new');
      } else if (state.timelineId === 'new') {
        // "new" without skipCreationScreen now means "go to AI mode"
        routerNavigate('/ai', { replace: true });
        return;
      } else {
        switchTimeline(state.timelineId);
      }
      routerNavigate('/editor', { replace: true, state: {} });
    }
  }, [location.state, user]);

  const handleTimelineSwitch = async (newTimelineId: string) => {
    if (newTimelineId === 'new') {
      routerNavigate('/ai');
      return;
    }

    // Dedup: if the user clicked the tile for the timeline that's already
    // loaded, there's nothing to switch to — skip the refetch.
    if (newTimelineId === timelineId) {
      return;
    }

    // Switch immediately; any in-flight autosave captured its own snapshot
    // (via debounce) and will still commit the outgoing timeline's data.
    await switchTimeline(newTimelineId);
  };

  const handleDraftSwitch = (newDraftId: string) => {
    // Dedup: already editing this draft, nothing to do.
    if (newDraftId === activeDraftId) {
      return;
    }
    const draft = loadDraft(newDraftId);
    if (!draft) {
      console.error('Draft not found:', newDraftId);
      return;
    }
    setActiveDraftId(draft.id);
    setTitle(draft.title);
    setDescription(draft.description);
    setEvents(draft.events);
    updateCategories(draft.categories);
    handleScaleChange(draft.scale);
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

  // Keep refs to the latest switch handlers so the registered callbacks
  // always invoke the current closure without re-registering every render.
  const timelineSwitchRef = useRef(handleTimelineSwitch);
  timelineSwitchRef.current = handleTimelineSwitch;
  const draftSwitchRef = useRef(handleDraftSwitch);
  draftSwitchRef.current = handleDraftSwitch;

  // Register our switch handlers for the global side panel once on mount.
  useEffect(() => {
    setOnTimelineSelect((id: string) => timelineSwitchRef.current(id));
    setOnDraftSelect((id: string) => draftSwitchRef.current(id));
    return () => {
      setOnTimelineSelect(null);
      setOnDraftSelect(null);
    };
  }, [setOnTimelineSelect, setOnDraftSelect]);

  // Keep the side panel informed of which timeline/draft is active so it can
  // highlight it. useLayoutEffect ensures the context update commits
  // synchronously with the editor's render. Cleanup clears it on unmount so
  // non-editor routes (e.g. Homepage) don't show a stale highlight.
  useLayoutEffect(() => {
    setActiveTimelineId(timelineId);
    return () => setActiveTimelineId(null);
  }, [timelineId, setActiveTimelineId]);

  useLayoutEffect(() => {
    setPanelActiveDraftId(activeDraftId);
    return () => setPanelActiveDraftId(null);
  }, [activeDraftId, setPanelActiveDraftId]);

  // Push live title edits to the side panel so the tile updates before autosave lands.
  useLayoutEffect(() => {
    setActiveTimelineTitle(title);
    return () => setActiveTimelineTitle(null);
  }, [title, setActiveTimelineTitle]);

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
        timelineId={timelineId}
        timelineTitle={title}
        onTimelineTitleChange={setTitle}
        events={events}
        timelineAccentColor={timelineAccentColor}
        onAddEventClick={handleAddEventClick}
        onEventsClick={() => setActivePanel(prev => prev === 'events' ? null : 'events')}
        onSettingsClick={() => setActivePanel(prev => prev === 'settings' ? null : 'settings')}
        activePanel={activePanel}
        onPresentMode={handlePresentMode}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
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
        categories={categories}
        onCategoriesChange={updateCategories}
        onEventsChange={handleBulkEventsChange}
        scale={scale}
        onScaleChange={handleScaleChange}
        activePanel={activePanel}
        onActivePanelChange={setActivePanel}
        showAddEventModal={showAddEventModal}
        onAddEventClick={handleAddEventClick}
        onCloseAddEventModal={() => setShowAddEventModal(false)}
      />
      {!user && events.length > 0 && !nudgeDismissed && (
        <div className="mx-4 mt-2 px-4 py-3 bg-blue-900/40 border border-blue-800/50 rounded-lg flex items-center justify-between text-sm">
          <span className="text-blue-200">
            Your work isn't saved to the cloud yet.{' '}
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-blue-400 underline hover:text-blue-300"
            >
              Sign in
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
        <main className="timeline-container relative mt-[140px]">
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
