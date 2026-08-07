import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { GlobalNav } from '@/components/Navigation/GlobalNav';
import { Timeline } from './components/Timeline/Timeline';
import { useTimelineState } from './hooks/useTimelineState';
import { useTimeline, type TimelineData } from './hooks/useTimeline';
import { useAuth } from './hooks/useAuth';
import { useAutosave } from './hooks/useAutosave';
import { useSidePanel } from './hooks/useSidePanel';
import { computeDominantCategoryColor } from './utils/dominantCategory';
import { UnsavedChangesModal } from './components/Modal/UnsavedChangesModal';
import { EventDetailPanel } from './components/EventDetailPanel/EventDetailPanel';
import { useLocalDraft } from './hooks/useLocalDraft';
import { TimelineEvent, CategoryConfig } from './types/event';
import { LimitReachedError, getCurrentLimits } from './lib/limits';
import { supabase } from './lib/supabase';
import { DEFAULT_TIMELINE_TITLE } from './constants/defaults';

function limitReachedMessage(kind: 'event' | 'timeline'): string {
  const { eventLimit, timelineLimit } = getCurrentLimits();
  if (kind === 'event') {
    return `You've reached the ${eventLimit}-event limit. Delete events to make room, or upgrade.`;
  }
  return `You've reached the ${timelineLimit}-timeline limit. Delete a timeline to create a new one, or upgrade.`;
}

export function App() {
  const {
    events, addEvent, addEvents, clearEvents, setEvents, updateEvent,
    title, description, setTitle, setDescription,
    categories, updateCategories, resetCategories,
    scale, currentScale, handleScaleChange,
    verticalScale, currentVerticalScale, handleVerticalScaleChange,
    groupByCategory, handleGroupByCategoryChange,
  } = useTimelineState();
  const { user, authReady } = useAuth();
  const { getMostRecentTimelineId, createTimelineFrom, loadTimeline } = useTimeline();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [pendingSwitchTimelineId, setPendingSwitchTimelineId] = useState<string | null>(null);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [activePanel, setActivePanel] = useState<'events' | 'settings' | null>(null);
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [mode, setMode] = useState<'edit' | 'view'>('edit');
  const [detailPanelEvent, setDetailPanelEvent] = useState<TimelineEvent | null>(null);
  const [pendingScrollDate, setPendingScrollDate] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const { loadAllDrafts, loadDraft, saveDraft, flushDraftSave, createDraft, clearAllDrafts, deleteDraft: deleteLocalDraft } = useLocalDraft();
  // Which timeline's contents are actually in the editor right now. This is the
  // only id the app may act on — autosave, Share and Delete all key off it.
  // It is written in exactly one place: applyLoadedTimeline().
  const [loadedTimelineId, setLoadedTimelineId] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  // Latches the location we've already acted on. A boolean here meant the
  // second navigation into an already-mounted /editor was ignored outright,
  // which is what made "Create a Timeline" and "Import Data" no-ops.
  const handledRouteStateRef = useRef<string | null>(null);
  // Same latch, for the logged-out effect. Guests take a completely separate
  // route-state path ({newTimeline} rather than {timelineId}), so it needs its
  // own — sharing one would let whichever effect ran first swallow the key.
  const handledDraftRouteKeyRef = useRef<string | null>(null);
  // Set once the editor has been given something to display, by either the
  // route-state effect or the no-route-state bootstrap, so the two can't both
  // claim the mount.
  const editorSeededRef = useRef(false);
  const migrationDoneRef = useRef(false);
  const { setOnTimelineSelect, setOnDraftSelect, refreshTimelines, setOnOpenSettings, setActiveTimelineId, setActiveDraftId: setPanelActiveDraftId, setActiveTimelineTitle, setActiveEventCount, setActiveDominantCategoryColor } = useSidePanel();

  const timelineData = {
    id: loadedTimelineId,
    title,
    description,
    events,
    categories,
    scale: currentScale.value,
    verticalScale: currentVerticalScale.value,
    groupByCategory,
  };

  const { saveStatus, lastSavedTime, handleChange, flushPendingSave, cancelPendingSave } = useAutosave(timelineData);

  const handleAddEventClick = () => {
    setActivePanel(null);
    setShowAddEventModal(true);
  };

  // Derive the dominant category color for the nav's status dot and the side-panel badge.
  const timelineAccentColor = useMemo(
    () => computeDominantCategoryColor(events, categories),
    [events, categories],
  );

  // Trigger autosave when timeline data changes.
  //
  // `loadedTimelineId` is null until a timeline's contents are actually in the
  // editor, so this can no longer fire with a real id next to another
  // timeline's (or the default empty) contents — which is what let a save
  // rename a timeline and diff-delete all of its events.
  useEffect(() => {
    if (loadedTimelineId) {
      handleChange({
        id: loadedTimelineId,
        title,
        description,
        events,
        categories,
        scale: currentScale.value,
        verticalScale: currentVerticalScale.value,
        groupByCategory,
      });
    }
  }, [loadedTimelineId, title, description, events, categories, currentScale.value, currentVerticalScale.value, groupByCategory, handleChange]);

  // Hydrate from localStorage draft if logged out.
  //
  // Gated on `authReady`: `user` is null both before the session lookup answers
  // and when the user is genuinely signed out, so without this every hard
  // refresh of /editor ran the logged-out path first — hydrating a stale draft
  // and clearing `location.state` before the signed-in effect below could read it.
  useEffect(() => {
    if (authReady && !user) {
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
        importedEvents?: TimelineEvent[];
      } | null;

      // Two different guards, because there are two different questions here.
      //
      // When the route state carries an instruction, latch on location.key like
      // the signed-in effect does — /editor → /editor doesn't remount App, so
      // the old once-per-mount boolean made every later "Create a Timeline"
      // click a silent no-op for guests.
      //
      // When it doesn't, we're bootstrapping the editor from whatever's in
      // storage, and that must happen only once per mount: the state:{} reset
      // at the end of this effect mints a fresh key, and re-running the
      // bootstrap on it would re-hydrate over the draft just created — and over
      // anything the user has typed since.
      const hasRouteInstruction = !!(
        routeState?.importedEvents ||
        routeState?.aiGenerated ||
        (routeState?.newTimeline && routeState.skipCreationScreen) ||
        routeState?.draftId
      );

      if (hasRouteInstruction) {
        if (handledDraftRouteKeyRef.current === location.key) return;
        handledDraftRouteKeyRef.current = location.key;
      } else if (draftHydrated) {
        return;
      }

      if (routeState?.importedEvents) {
        const newDraft = createDraft();
        if (!newDraft) {
          alert(limitReachedMessage('timeline'));
          routerNavigate('/', { replace: true });
          setDraftHydrated(true);
          return;
        }
        const imported = routeState.importedEvents;
        setActiveDraftId(newDraft.id);
        setTitle(newDraft.title);
        setDescription(newDraft.description);
        setEvents(imported);
        updateCategories(newDraft.categories);
        handleScaleChange(newDraft.scale);
        handleVerticalScaleChange(newDraft.verticalScale ?? 'medium');
        if (imported.length > 0) {
          const earliest = imported.reduce((a, b) => a.startDate < b.startDate ? a : b);
          setPendingScrollDate(earliest.startDate);
        }
      } else if (routeState?.aiGenerated) {
        // Arriving from AI mode with a freshly generated timeline — create a draft
        // and seed it with the generated data.
        const newDraft = createDraft();
        if (!newDraft) {
          alert(limitReachedMessage('timeline'));
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
        handleVerticalScaleChange(newDraft.verticalScale ?? 'medium');
        if (aiEvents.length > 0) {
          const earliest = aiEvents.reduce((a, b) => a.startDate < b.startDate ? a : b);
          setPendingScrollDate(earliest.startDate);
        }
      } else if (routeState?.newTimeline && routeState.skipCreationScreen) {
        // "Create a Timeline" — create draft immediately
        const newDraft = createDraft();
        if (!newDraft) {
          alert(limitReachedMessage('timeline'));
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
        handleVerticalScaleChange(newDraft.verticalScale ?? 'medium');
        // Reset grouping too, or the previous draft's setting leaks into this
        // brand-new one — the sibling branches below already do this.
        handleGroupByCategoryChange(newDraft.groupByCategory ?? false);
      } else if (routeState?.draftId) {
        // Resuming a local draft (e.g. from the side panel)
        const draft = loadDraft(routeState.draftId);
        if (draft) {
          setActiveDraftId(draft.id);
          setTitle(draft.title);
          setDescription(draft.description);
          setEvents(draft.events);
          updateCategories(draft.categories);
          handleScaleChange(draft.scale);
          handleVerticalScaleChange(draft.verticalScale ?? 'medium');
          handleGroupByCategoryChange(draft.groupByCategory ?? false);
        } else {
          routerNavigate('/', { replace: true });
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
          handleVerticalScaleChange(mostRecent.verticalScale ?? 'medium');
          handleGroupByCategoryChange(mostRecent.groupByCategory ?? false);
        } else {
          routerNavigate('/', { replace: true });
          setDraftHydrated(true);
          return;
        }
      }

      setDraftHydrated(true);
      // Clear the route state so refreshing doesn't re-trigger
      routerNavigate('/editor', { replace: true, state: {} });
    }
  }, [authReady, user, draftHydrated, createDraft, handleScaleChange, handleVerticalScaleChange, handleGroupByCategoryChange, loadAllDrafts, loadDraft, location.state, location.key, routerNavigate, setDescription, setEvents, setTitle, updateCategories]);

  // Guest drafts save on a 500 ms debounce, so a rename followed immediately by
  // closing the tab or navigating away would be lost — the draft path has no
  // equivalent of the signed-in beforeunload guard, because `hasUnsavedChanges`
  // is never set for it. localStorage writes are synchronous, so flushing from
  // an unload handler reliably commits.
  useEffect(() => {
    const flush = () => flushDraftSave();
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flushDraftSave]);

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
        verticalScale: currentVerticalScale.value,
        groupByCategory,
        savedAt: new Date().toISOString()
      });
    }
  }, [user, draftHydrated, activeDraftId, title, description, events, categories, currentScale.value, currentVerticalScale.value, groupByCategory, saveDraft]);

  // Migrate localStorage drafts to Supabase on login
  useEffect(() => {
    if (!user || !draftHydrated || migrationDoneRef.current) return;
    migrationDoneRef.current = true;

    const allDrafts = loadAllDrafts();
    const draftsWithEvents = allDrafts.filter(d => d.events.length > 0);

    if (draftsWithEvents.length > 0) {
      (async () => {
        for (const draft of draftsWithEvents) {
          try {
            await createTimelineFrom(draft.title, draft.events, draft.scale, draft.verticalScale ?? 'medium');
          } catch (err: unknown) {
            if (err instanceof LimitReachedError) {
              alert(
                `${limitReachedMessage(err.kind)} Some drafts couldn't be saved.`
              );
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
  }, [user, draftHydrated, clearAllDrafts, loadAllDrafts, createTimelineFrom]);

  /**
   * The one and only writer of the editor's contents *and* of the id those
   * contents belong to. Every setter plus `setLoadedTimelineId` runs in a
   * single synchronous block, so React 18 commits them together and no render
   * — and therefore no autosave — can ever observe one timeline's id beside
   * another timeline's data.
   *
   * If you add a field to the editor, add it here too: anything set outside
   * this function reopens the desync this exists to prevent.
   */
  const applyLoadedTimeline = useCallback((data: TimelineData) => {
    setTitle(data.title);
    setDescription(data.description || '');
    setEvents(data.events);
    if (data.categories) {
      updateCategories(data.categories);
    } else {
      resetCategories();
    }
    handleScaleChange(data.scale || 'medium');
    handleVerticalScaleChange(data.verticalScale ?? 'small');
    handleGroupByCategoryChange(data.groupByCategory ?? false);
    setLoadedTimelineId(data.id);
  }, [setTitle, setDescription, setEvents, updateCategories, resetCategories, handleScaleChange, handleVerticalScaleChange, handleGroupByCategoryChange]);

  const switchTimeline = useCallback(async (newTimelineId: string) => {
    try {
      // Commit anything still pending for the outgoing timeline before its
      // contents are replaced. The debounced save holds a snapshot of its
      // arguments, and the next edit would overwrite them — silently dropping
      // the last couple of seconds of work on the timeline we're leaving.
      await flushPendingSave();

      // Load new data first — don't clear state until we have the replacement
      const data = await loadTimeline(newTimelineId);

      // Only update state after a successful load, and via the single
      // atomic writer so the id and the contents can't drift apart.
      applyLoadedTimeline(data);
    } catch (error) {
      console.error('Error switching timeline:', error);
      // `.single()` returns PGRST116 when the row doesn't exist — that's the
      // "stale tile pointing at a deleted timeline" case. Land the user back
      // on home quietly rather than stranding them in /editor with an alert.
      const code = (error as { code?: string } | null)?.code;
      if (code === 'PGRST116') {
        setLoadedTimelineId(null);
        routerNavigate('/', { replace: true });
        return;
      }
      // Creating a timeline goes through here too ('new'), so the plan cap is
      // a normal outcome — telling the user to retry would be a lie.
      if (error instanceof LimitReachedError) {
        alert(limitReachedMessage(error.kind));
        return;
      }
      alert('Failed to load timeline. Please try again.');
    }
  }, [flushPendingSave, loadTimeline, applyLoadedTimeline, routerNavigate]);

  // Handle navigation from AI mode or the side panel with a specific timeline to load
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
      importedEvents?: TimelineEvent[];
    } | null;
    if (!authReady || !user) return;

    // Latch on the location itself, not a boolean. /editor → /editor doesn't
    // remount App, so a once-per-mount flag made every navigation after the
    // first a silent no-op — "Create a Timeline", "Import Data" and a second
    // hand-off from AI mode all did nothing at all.
    //
    // Recorded unconditionally, and only after the auth guard: the state:{}
    // replacements below mint a fresh key, and that pass needs latching too,
    // while an early pass with no user yet must not consume the real key.
    if (handledRouteStateRef.current === location.key) return;
    handledRouteStateRef.current = location.key;

    if (state?.importedEvents) {
      editorSeededRef.current = true;
      const imported = state.importedEvents;
      (async () => {
        await switchTimeline('new');
        setEvents(imported);
        if (imported.length > 0) {
          const earliest = imported.reduce((a, b) => a.startDate < b.startDate ? a : b);
          setPendingScrollDate(earliest.startDate);
        }
      })();
      routerNavigate('/editor', { replace: true, state: {} });
    } else if (state?.aiGenerated) {
      editorSeededRef.current = true;
      const aiData = state.aiGenerated;
      (async () => {
        // Creates the timeline row in Supabase and binds the editor to it, so
        // autosave persists the state updates below to the new row.
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
      editorSeededRef.current = true;
      if (state.timelineId === 'new' && state.skipCreationScreen) {
        switchTimeline('new');
      } else if (state.timelineId === 'new') {
        // "new" without skipCreationScreen now means "go to AI mode" (which lives at /)
        routerNavigate('/', { replace: true });
        return;
      } else {
        switchTimeline(state.timelineId);
      }
      routerNavigate('/editor', { replace: true, state: {} });
    }
  }, [location.state, location.key, authReady, user, routerNavigate, setDescription, setEvents, setTitle, switchTimeline, updateCategories]);

  // Signed in, on /editor, with nothing in the route state telling us what to
  // show — a bookmark, a refresh, or the browser back button.
  //
  // Previously nothing loaded here at all: `useTimeline` just pointed itself at
  // an arbitrary row on mount while the editor still held its empty defaults,
  // and autosave then wrote those defaults over that row. Now the id only ever
  // arrives attached to the data it names, via switchTimeline.
  useEffect(() => {
    if (!authReady || !user || editorSeededRef.current) return;

    const state = location.state as {
      timelineId?: string;
      aiGenerated?: unknown;
      importedEvents?: unknown;
    } | null;
    // The effect above owns these; it runs first and will set the seed flag.
    if (state?.timelineId || state?.aiGenerated || state?.importedEvents) return;

    editorSeededRef.current = true;
    (async () => {
      try {
        const mostRecentId = await getMostRecentTimelineId();
        if (mostRecentId) {
          await switchTimeline(mostRecentId);
        } else {
          // Nothing to open — send them to the AI entry point to make one.
          routerNavigate('/', { replace: true });
        }
      } catch (err) {
        console.error('Failed to open a timeline:', err);
        setBootstrapError('Failed to load your timelines. Please try again.');
      }
    })();
  }, [authReady, user, location.state, bootstrapAttempt, getMostRecentTimelineId, switchTimeline, routerNavigate]);

  const retryBootstrap = () => {
    setBootstrapError(null);
    editorSeededRef.current = false;
    setBootstrapAttempt(n => n + 1);
  };

  const handleTimelineSwitch = async (newTimelineId: string) => {
    if (newTimelineId === 'new') {
      routerNavigate('/');
      return;
    }

    // Dedup: if the user clicked the tile for the timeline that's already
    // loaded, there's nothing to switch to — skip the refetch.
    //
    // Compared against the *loaded* id specifically. When this compared against
    // a separate pointer, a desynced pointer made the tile it named permanently
    // unclickable: the guard matched, so its contents never loaded.
    if (newTimelineId === loadedTimelineId) {
      return;
    }

    await switchTimeline(newTimelineId);
  };

  const handleDraftSwitch = (newDraftId: string) => {
    // Dedup: already editing this draft, nothing to do.
    if (newDraftId === activeDraftId) {
      return;
    }
    // Commit the outgoing draft's pending save before its contents are replaced.
    // Without this the debounced call's arguments are overwritten by the
    // incoming draft's snapshot and the last <500 ms of edits are dropped —
    // the same hazard switchTimeline flushes for on the signed-in path.
    flushDraftSave();

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
    handleVerticalScaleChange(draft.verticalScale ?? 'medium');
    handleGroupByCategoryChange(draft.groupByCategory ?? false);
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
    setOnOpenSettings(() => setActivePanel('settings'));
    return () => {
      setOnTimelineSelect(null);
      setOnDraftSelect(null);
      setOnOpenSettings(null);
    };
  }, [setOnTimelineSelect, setOnDraftSelect, setOnOpenSettings]);

  // Keep the side panel informed of which timeline/draft is active so it can
  // highlight it. useLayoutEffect ensures the context update commits
  // synchronously with the editor's render. Cleanup clears it on unmount so
  // non-editor routes (e.g. AI mode) don't show a stale highlight.
  useLayoutEffect(() => {
    setActiveTimelineId(loadedTimelineId);
    return () => setActiveTimelineId(null);
  }, [loadedTimelineId, setActiveTimelineId]);

  useLayoutEffect(() => {
    setPanelActiveDraftId(activeDraftId);
    return () => setPanelActiveDraftId(null);
  }, [activeDraftId, setPanelActiveDraftId]);

  // Push live title edits to the side panel so the tile updates before autosave lands.
  useLayoutEffect(() => {
    setActiveTimelineTitle(title);
    return () => setActiveTimelineTitle(null);
  }, [title, setActiveTimelineTitle]);

  // Push live event count + dominant category color to the side panel so the
  // badge updates the instant the user adds/removes/edits an event — without
  // waiting on autosave + the metadata refetch cycle.
  useLayoutEffect(() => {
    setActiveEventCount(events.length);
    return () => setActiveEventCount(null);
  }, [events.length, setActiveEventCount]);

  useLayoutEffect(() => {
    setActiveDominantCategoryColor(timelineAccentColor);
    return () => setActiveDominantCategoryColor(null);
  }, [timelineAccentColor, setActiveDominantCategoryColor]);

  const handleClearTimeline = () => {
    clearEvents();
  };

  const handleDeleteTimeline = async () => {
    // Drop any queued save before the row goes away. This is the one case where
    // cancelling beats flushing: the editor now flushes on unmount, and
    // navigating away below would otherwise re-insert the events we just
    // deleted. Unbinding the editor is what makes that flush a no-op.
    cancelPendingSave();
    const deletingId = loadedTimelineId;
    setLoadedTimelineId(null);

    try {
      if (user && deletingId) {
        const { error: deleteError } = await supabase
          .from('timelines')
          .delete()
          .eq('id', deletingId);
        if (deleteError) throw deleteError;
      } else if (activeDraftId) {
        deleteLocalDraft(activeDraftId);
      }
    } catch (err) {
      console.error('Failed to delete timeline:', err);
      alert('Failed to delete. Please try again.');
      return;
    }

    // Clear the side panel's active id first so the synthetic-row fallback
    // can't keep the deleted tile visible, then force a refetch — the
    // realtime DELETE event isn't fast enough to rely on here.
    setActiveTimelineId(null);
    refreshTimelines();

    setTitle(DEFAULT_TIMELINE_TITLE);
    setDescription('');
    setEvents([]);
    resetCategories();
    setActiveDraftId(null);
    setActivePanel(null);
    routerNavigate('/');
  };

  const handleUpdateEvent = (updatedEvent: TimelineEvent) => {
    updateEvent(updatedEvent);
  };

  const handleDeleteEvent = (eventId: string) => {
    setEvents(events.filter(e => e.id !== eventId));
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
    <div className="app-container h-screen bg-black text-white overflow-hidden flex flex-col">
      <GlobalNav
        variant="timeline"
        timelineId={loadedTimelineId}
        timelineTitle={title}
        onTimelineTitleChange={setTitle}
        events={events}
        timelineAccentColor={timelineAccentColor}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
        mode={mode}
        onModeChange={(newMode) => {
          setMode(newMode);
          // Force any open editing panel closed when switching to view mode.
          if (newMode === 'view') setActivePanel(null);
        }}
      />
      <Header
        title={title}
        description={description}
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
        verticalScale={verticalScale}
        onVerticalScaleChange={handleVerticalScaleChange}
        groupByCategory={groupByCategory}
        onGroupByCategoryChange={handleGroupByCategoryChange}
        activePanel={activePanel}
        onActivePanelChange={setActivePanel}
        showAddEventModal={showAddEventModal}
        onAddEventClick={handleAddEventClick}
        onCloseAddEventModal={() => setShowAddEventModal(false)}
        onDeleteTimeline={handleDeleteTimeline}
        mode={mode}
      />
      {bootstrapError ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full text-center">
            <p className="text-red-400 mb-4">{bootstrapError}</p>
            <button
              onClick={retryBootstrap}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <main className="timeline-container relative flex-1 min-h-0 flex flex-col pt-[140px]">
          <Timeline
            events={events}
            categories={categories}
            onAddEvent={mode === 'edit' ? addEvent : undefined}
            onUpdateEvent={mode === 'edit' ? handleUpdateEvent : undefined}
            onDeleteEvent={mode === 'edit' ? handleDeleteEvent : undefined}
            onOpenDetails={(event) => setDetailPanelEvent(event)}
            scale={currentScale}
            verticalScale={currentVerticalScale}
            groupByCategory={groupByCategory}
            pendingScrollDate={pendingScrollDate}
            onScrollComplete={() => setPendingScrollDate(null)}
            mode={mode}
          />
        </main>
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
      <EventDetailPanel
        open={detailPanelEvent !== null}
        event={detailPanelEvent}
        timelineTitle={title}
        mode={mode}
        onClose={() => setDetailPanelEvent(null)}
        onEventChange={(updated) => {
          handleUpdateEvent(updated);
          setDetailPanelEvent(updated);
        }}
      />
    </div>
  );
}
