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
import { TrialGateModal } from './components/Modal/TrialGateModal';
import { ApiKeyModal } from './components/Modal/ApiKeyModal';
import { AuthModal } from './components/Auth/AuthModal';
import { exportEventsToExcel } from './utils/excelExport';
import { notifyUsageChanged } from './utils/usageChanged';
import { EventDetailPanel } from './components/EventDetailPanel/EventDetailPanel';
import { useLocalDraft } from './hooks/useLocalDraft';
import { useAccountTier, type AccountTier } from './hooks/useAccountTier';
import { byokAnonDraftStore, trialDraftStore } from './utils/draftStorage';
import { TimelineEvent, CategoryConfig } from './types/event';
import { LimitReachedError, getCurrentLimits } from './lib/limits';
import { supabase } from './lib/supabase';
import { DEFAULT_TIMELINE_TITLE } from './constants/defaults';
import { DEFAULT_CATEGORIES } from './constants/categories';

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
  const tier = useAccountTier();
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  // Where this visitor's browser-held work lives. Trial gets sessionStorage —
  // one timeline, gone when the tab closes; byok-anon keeps the localStorage
  // draft set. Signed-in users use neither, but the hook still needs a store,
  // and byok-anon's is the one reconciliation drains into Supabase.
  //
  // The one wrinkle: a draft that is *already* in localStorage keeps being
  // written there even after the tier drops to trial. Removing an API key
  // takes away AI access, not work that was already saved — and switching the
  // write target mid-edit would fork the draft into two stores, leaving the
  // localStorage copy silently stale while the user kept typing.
  const localStore = useMemo(() => {
    if (tier !== 'trial') return byokAnonDraftStore;
    if (activeDraftId && byokAnonDraftStore.getDraft(activeDraftId)) return byokAnonDraftStore;
    return trialDraftStore;
  }, [tier, activeDraftId]);
  const { getMostRecentTimelineId, createTimelineFrom, loadTimeline } = useTimeline();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activePanel, setActivePanel] = useState<'events' | 'settings' | null>(null);
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [mode, setMode] = useState<'edit' | 'view'>('edit');
  const [detailPanelEvent, setDetailPanelEvent] = useState<TimelineEvent | null>(null);
  const [pendingScrollDate, setPendingScrollDate] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  // The route instruction a trial visitor asked for while their single slot was
  // still occupied. Held here rather than acted on, until they say what should
  // happen to the work already in the editor. Replayed by re-navigating with
  // the same state, which mints a fresh location.key and lets the hydration
  // effect below run the identical branch a second time.
  const [trialGateState, setTrialGateState] = useState<Record<string, unknown> | null>(null);
  const { loadAllDrafts, loadDraft, saveDraft, saveDraftImmediate, flushDraftSave, cancelPendingDraftSave, createDraft, deleteDraft: deleteLocalDraft } = useLocalDraft(localStore);
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
  // Which tier we have finished reconciling storage for. Compared against the
  // live tier rather than being a bare boolean, so that signing in or adding a
  // key mid-session re-runs the check instead of latching on the first answer.
  const [reconciledTier, setReconciledTier] = useState<AccountTier | null>(null);
  const reconcileStartedRef = useRef<AccountTier | null>(null);
  // Nothing may hydrate, seed or create until storage has been reconciled: all
  // three would otherwise write into a store whose contents are about to move.
  const storageReconciled = tier !== 'loading' && reconciledTier === tier;
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

  const { saveStatus, lastSavedTime, handleChange, markClean, flushPendingSave, cancelPendingSave } = useAutosave(timelineData);

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
    // storageReconciled, not just authReady: adding a key promotes this
    // visitor from trial to byok-anon, and hydrating before that content has
    // moved would create a fresh draft in the new store while the old one
    // still holds the only copy of their work.
    if (authReady && storageReconciled && !user) {
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
          // Trial: the slot is full and its occupant exists nowhere else, so
          // ask before replacing it. Deliberately does NOT navigate away or
          // clear the route state — the editor keeps showing the work under
          // discussion, and the stashed state replays once they choose.
          if (tier === 'trial') {
            setTrialGateState(routeState as Record<string, unknown>);
            setDraftHydrated(true);
            return;
          }
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
          // Trial: the slot is full and its occupant exists nowhere else, so
          // ask before replacing it. Deliberately does NOT navigate away or
          // clear the route state — the editor keeps showing the work under
          // discussion, and the stashed state replays once they choose.
          if (tier === 'trial') {
            setTrialGateState(routeState as Record<string, unknown>);
            setDraftHydrated(true);
            return;
          }
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
          // Trial: the slot is full and its occupant exists nowhere else, so
          // ask before replacing it. Deliberately does NOT navigate away or
          // clear the route state — the editor keeps showing the work under
          // discussion, and the stashed state replays once they choose.
          if (tier === 'trial') {
            setTrialGateState(routeState as Record<string, unknown>);
            setDraftHydrated(true);
            return;
          }
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
  }, [authReady, storageReconciled, tier, user, draftHydrated, createDraft, handleScaleChange, handleVerticalScaleChange, handleGroupByCategoryChange, loadAllDrafts, loadDraft, location.state, location.key, routerNavigate, setDescription, setEvents, setTitle, updateCategories]);

  // Guest drafts save on a 500 ms debounce, so a rename followed immediately by
  // closing the tab or navigating away would be lost — the draft path has no
  // equivalent of the signed-in beforeunload guard, because `hasUnsavedChanges`
  // is never set for it. localStorage writes are synchronous, so flushing from
  // an unload handler reliably commits.
  //
  // useLayoutEffect, and declared above the side-panel pushes below, so that on
  // unmount this cleanup runs *before* they null `activeDraftId`. That null is
  // what makes the panel re-read localStorage; flushing afterwards would mean it
  // re-read stale data and nothing ever corrected it.
  useLayoutEffect(() => {
    const flush = () => flushDraftSave();
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flushDraftSave]);

  // Warn a trial visitor before the tab takes their work with it.
  //
  // Only trial: sessionStorage dies with the tab, so this is the one state
  // where closing it actually destroys something. byok-anon's drafts and a
  // signed-in user's timelines are both still there afterwards.
  //
  // The generic browser dialog is the whole ceiling here — `beforeunload`
  // cannot show custom UI, so offering to sign in at this point isn't
  // possible; the gate covers the moment that can be handled properly.
  useEffect(() => {
    if (tier !== 'trial' || events.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [tier, events.length]);

  // Save to the browser store when logged out.
  //
  // Held off until reconciliation settles: mid-migration the store this writes
  // through has already switched to the new tier's home, and writing there
  // while the old home is still being drained races the copy — the stale side
  // can land last and overwrite the fresher one.
  useEffect(() => {
    if (!user && storageReconciled && draftHydrated && activeDraftId) {
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
  }, [user, storageReconciled, draftHydrated, activeDraftId, title, description, events, categories, currentScale.value, currentVerticalScale.value, groupByCategory, saveDraft]);

  /**
   * Move any work that is sitting in a store below the visitor's current tier
   * into the home that tier actually uses.
   *
   * Deliberately a reconciliation, not a transition watcher. The identity
   * change that strands the content usually happens while this component is
   * unmounted — the API-key gate lives on `/` (AIModePage), and sign-in can be
   * started from the side panel on any route — so there is no falsy→truthy
   * flip here to observe. On the way back the value is simply already set. The
   * only question that survives that is "does content exist somewhere that
   * isn't my home?", asked on every mount.
   *
   * Promotes upward only. A byok-anon user who *removes* their key becomes
   * trial, and their localStorage drafts must be left exactly where they are:
   * intact, and recoverable the moment the key comes back.
   */
  useEffect(() => {
    if (tier === 'loading') return;
    // Ref, not the state, so a re-render mid-run can't start a second pass.
    if (reconcileStartedRef.current === tier) return;
    reconcileStartedRef.current = tier;

    // Commit anything the debounce still holds before reading the stores. The
    // pending write is a *snapshot*; without this the last ≤500 ms of edits
    // never reach storage and are then destroyed by the clear below.
    flushDraftSave();

    if (tier === 'trial') {
      // Nothing ranks below trial — this is already home.
      setReconciledTier(tier);
      return;
    }

    if (tier === 'byok-anon') {
      // sessionStorage → localStorage. Both are synchronous, so this completes
      // within the effect and no await window exists for anything to observe a
      // half-migrated state.
      const orphans = trialDraftStore.getAllDrafts();
      let rejected = 0;
      for (const draft of orphans) {
        // Via the hook, not the store: it seeds the fingerprint baseline for
        // this id against its new home. A raw write would leave the baseline
        // describing the old store and let the next render commit a spurious
        // "edit" that bumps savedAt and reorders the panel.
        if (saveDraftImmediate({ ...draft, savedAt: new Date().toISOString() })) {
          trialDraftStore.deleteDraft(draft.id);
        } else {
          rejected += 1;
        }
      }
      if (rejected > 0) {
        // At capacity. The trial copy is still the only copy, so it stays put
        // rather than being dropped on the floor.
        alert(
          `${limitReachedMessage('timeline')} Your unsaved timeline is still here — free up a slot to keep it.`
        );
      }
      setReconciledTier(tier);
      return;
    }

    // Signed in: both browser stores drain into Supabase.
    (async () => {
      const pending = [
        ...trialDraftStore.getAllDrafts().map(draft => ({ draft, store: trialDraftStore })),
        ...byokAnonDraftStore.getAllDrafts().map(draft => ({ draft, store: byokAnonDraftStore })),
      ];

      for (const { draft, store } of pending) {
        // Empty drafts carry nothing worth a row; drop them without a round trip.
        if (draft.events.length === 0) {
          store.deleteDraft(draft.id);
          continue;
        }
        try {
          await createTimelineFrom(draft.title, draft.events, draft.scale, draft.verticalScale ?? 'medium');
          // Only after the write is confirmed, and only this one. The previous
          // version cleared *everything* after a failure, so hitting the plan
          // cap mid-migration deleted every draft that hadn't been saved yet.
          store.deleteDraft(draft.id);
        } catch (err: unknown) {
          if (err instanceof LimitReachedError) {
            alert(`${limitReachedMessage(err.kind)} Some drafts couldn't be saved.`);
            break;
          }
          console.error('Failed to migrate draft:', err);
          // Left in place deliberately: a transient failure should still be
          // recoverable on the next mount.
        }
      }

      setActiveDraftId(null);
      // Guarded by the ref rather than a `cancelled` flag deliberately. This
      // effect re-runs whenever createTimelineFrom's identity changes — which a
      // token refresh alone can do, mid-flight — and a cancel-on-cleanup flag
      // would then swallow the only call that ever sets this, leaving
      // storageReconciled false forever and the editor permanently blank.
      // Comparing against the ref instead means whichever run still owns the
      // current tier reports completion, and a superseded one stays quiet.
      if (reconcileStartedRef.current === tier) setReconciledTier(tier);
    })();
  }, [tier, flushDraftSave, saveDraftImmediate, createTimelineFrom]);

  /**
   * Run the instruction the trial gate was holding, once the visitor has
   * actually acquired an identity and their work has been moved to safety.
   *
   * Waits on storageReconciled specifically: replaying while the trial store is
   * still being drained would create the new timeline first and leave the old
   * content to be adopted afterwards — or, in the signed-in case, race the
   * migration's own inserts.
   */
  useEffect(() => {
    if (!trialGateState) return;
    if (tier === 'loading' || tier === 'trial') return;
    if (!storageReconciled) return;

    let state = trialGateState;
    // "Create a Timeline" is spelled differently on the two paths — the guest
    // effect reads {newTimeline}, the signed-in one reads {timelineId:'new'}.
    // Someone who answered the gate by signing in crossed between them, so the
    // instruction has to be translated or it matches no branch at all and the
    // click is silently swallowed.
    if (user && state.newTimeline && state.skipCreationScreen) {
      state = { timelineId: 'new', skipCreationScreen: true };
    }

    setTrialGateState(null);
    routerNavigate('/editor', { replace: true, state });
  }, [trialGateState, tier, storageReconciled, user, routerNavigate]);

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
    // Normalise ONCE and feed the same values to both the setters and
    // markClean. `useTimeline`'s TimelineData has these optional while
    // autosave's has them required, and this is where the two meet — if the
    // baseline were taken from the raw payload while the editor got the
    // normalised one, every load would look dirty and write itself back.
    const description = data.description || '';
    const scale = data.scale || 'medium';
    const verticalScale = data.verticalScale ?? 'small';
    const groupByCategory = data.groupByCategory ?? false;
    // Resolved here rather than left to `updateCategories`' own fallback, so
    // the baseline below records what will actually be in state. Autosave
    // persists categories now, which means an unresolved `undefined` here
    // fingerprints differently from the defaults that land a moment later —
    // and every load would write itself straight back, reordering the panel
    // just for having been opened.
    const categories = data.categories?.length ? data.categories : DEFAULT_CATEGORIES;

    // First, before any setter, so no ordering of effects can let the autosave
    // effect see this content while the baseline still describes the last one.
    markClean({
      id: data.id,
      title: data.title,
      description,
      events: data.events,
      categories,
      scale,
      verticalScale,
      groupByCategory,
    });

    setTitle(data.title);
    setDescription(description);
    setEvents(data.events);
    updateCategories(categories);
    handleScaleChange(scale);
    handleVerticalScaleChange(verticalScale);
    handleGroupByCategoryChange(groupByCategory);
    setLoadedTimelineId(data.id);
  }, [markClean, setTitle, setDescription, setEvents, updateCategories, handleScaleChange, handleVerticalScaleChange, handleGroupByCategoryChange]);

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
    if (!authReady || !storageReconciled || !user) return;

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
  }, [location.state, location.key, authReady, storageReconciled, user, routerNavigate, setDescription, setEvents, setTitle, switchTimeline, updateCategories]);

  // Signed in, on /editor, with nothing in the route state telling us what to
  // show — a bookmark, a refresh, or the browser back button.
  //
  // Previously nothing loaded here at all: `useTimeline` just pointed itself at
  // an arbitrary row on mount while the editor still held its empty defaults,
  // and autosave then wrote those defaults over that row. Now the id only ever
  // arrives attached to the data it names, via switchTimeline.
  useEffect(() => {
    // Waits on reconciliation too, or it opens whatever was most recent
    // *before* migration ran — which for someone who just signed in with local
    // work is the wrong timeline, or none at all.
    if (!authReady || !storageReconciled || !user || editorSeededRef.current) return;

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
  }, [authReady, storageReconciled, user, location.state, bootstrapAttempt, getMostRecentTimelineId, switchTimeline, routerNavigate]);

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

  /**
   * Replay the instruction that was blocked by a full trial slot.
   *
   * Re-navigating with the same state rather than calling the branch directly:
   * it mints a fresh location.key, which is exactly what the hydration effect's
   * latch keys off, so the identical branch runs again with no duplicated
   * seeding logic to drift out of sync.
   */
  const replayTrialGateState = (state: Record<string, unknown>) => {
    setTrialGateState(null);
    routerNavigate('/editor', { replace: true, state });
  };

  const handleTrialDiscard = () => {
    const pending = trialGateState;
    if (!pending) return;
    // Drop the armed write first, or the 500 ms debounce lands after the clear
    // and resurrects the timeline the user just chose to throw away.
    cancelPendingDraftSave();
    trialDraftStore.clearAllDrafts();
    setActiveDraftId(null);
    replayTrialGateState(pending);
  };

  const handleTrialExport = () => {
    try {
      exportEventsToExcel(events, title || DEFAULT_TIMELINE_TITLE);
    } catch (err) {
      console.error('Failed to export trial timeline:', err);
      alert('Failed to export. Please try again.');
    }
    // Stays open on purpose: downloading is not itself an answer to "keep or
    // discard", and closing here would silently abandon the pending action.
  };

  const handleTrialKeep = () => {
    // Hand off to the existing chooser. Whichever path they take flips the
    // tier, which triggers reconciliation; the effect below replays the
    // pending instruction once the content has moved to its new home.
    setShowApiKeyModal(true);
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
    // Refreshes rows and tile metadata but never the usage counts, and realtime
    // cannot report a delete — see `utils/usageChanged.ts`.
    notifyUsageChanged();

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
        categories={categories}
        onCategoriesChange={updateCategories}
        timelineAccentColor={timelineAccentColor}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
        mode={mode}
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
        onModeChange={(newMode) => {
          setMode(newMode);
          if (newMode === 'view') {
            // Settings has no control in present mode, so it must not stay
            // open. Events does — it keeps its dock button and opens read-only.
            setActivePanel(prev => (prev === 'settings' ? null : prev));
            setShowAddEventModal(false);
          }
        }}
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
      <TrialGateModal
        isOpen={trialGateState !== null}
        eventCount={events.length}
        onClose={() => setTrialGateState(null)}
        onDiscard={handleTrialDiscard}
        onExport={handleTrialExport}
        onKeep={handleTrialKeep}
      />
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onKeySaved={() => setShowApiKeyModal(false)}
        onRequestSignIn={() => {
          setShowApiKeyModal(false);
          setShowAuthModal(true);
        }}
      />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
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
