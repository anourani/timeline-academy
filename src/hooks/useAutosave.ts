import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { debounce } from '../utils/debounce';
import { supabase } from '../lib/supabase';
import { saveTimelineEvents } from '../utils/saveEvents';
import {
  createEventsFingerprint,
  fingerprintsEqual,
  metaFingerprint,
  type Fingerprint,
} from '../utils/timelineFingerprint';
import type { SaveStatus } from '../components/SaveStatusIndicator/SaveStatusIndicator';
import type { TimelineEvent, CategoryConfig } from '../types/event';

interface TimelineData {
  id: string | null;
  title: string;
  description: string;
  events: TimelineEvent[];
  categories: CategoryConfig[];
  scale: 'large' | 'medium' | 'small';
  verticalScale: 'small' | 'medium';
  groupByCategory: boolean;
}

/** What the caller must supply to declare the editor clean. */
export type CleanState = Omit<TimelineData, 'categories'>;

export function useAutosave(timelineData: TimelineData) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<Date>();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Refs, not state: `handleChange` sits in the editor's autosave effect
  // dependency array, so any identity churn here would re-fire that effect.
  const eventsFpRef = useRef(createEventsFingerprint());
  // What the database holds, OR what an armed/in-flight write is about to make
  // it hold. Null means "unknown" — treat everything as dirty.
  const intendedRef = useRef<Fingerprint | null>(null);
  // What a save is known to have actually completed. Backstop only.
  const persistedRef = useRef<Fingerprint | null>(null);

  const fingerprintOf = useCallback((data: CleanState): Fingerprint => ({
    // `categories` is deliberately absent: autosave does not persist them, so
    // a category edit must not count as a change to be written.
    meta: metaFingerprint({
      id: data.id ?? '',
      title: data.title,
      description: data.description,
      scale: data.scale,
      verticalScale: data.verticalScale,
      groupByCategory: data.groupByCategory,
    }),
    events: eventsFpRef.current(data.events),
  }), []);

  /**
   * Declare this exact content as already stored. The editor calls it when a
   * timeline finishes loading, so applying freshly fetched data doesn't look
   * like an edit and trigger a write-back.
   */
  const markClean = useCallback((data: CleanState) => {
    const fp = fingerprintOf(data);
    intendedRef.current = fp;
    persistedRef.current = fp;
  }, [fingerprintOf]);

  const save = useCallback(async (data: TimelineData) => {
    if (!data.id) return;

    // Backstop for callers that reach save() without going through
    // handleChange — notably the back-online retry below. Skipping here also
    // avoids saveTimelineEvents' full events SELECT.
    if (fingerprintsEqual(persistedRef.current, fingerprintOf(data))) return;

    try {
      setSaveStatus('saving');
      
      // First update the timeline
      const { error: timelineError } = await supabase
        .from('timelines')
        .update({
          title: data.title,
          description: data.description,
          scale: data.scale,
          vertical_scale: data.verticalScale,
          group_by_category: data.groupByCategory,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.id);

      if (timelineError) throw timelineError;

      // Diff-based event save
      await saveTimelineEvents(data.id, data.events);

      // This payload's fingerprint, not the editor's current one — a newer
      // edit that landed mid-flight has already armed its own write.
      persistedRef.current = fingerprintOf(data);

      const now = new Date();
      setSaveStatus('saved');
      setLastSavedTime(now);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Save error:', error);
      // Null BOTH refs. If the timelines UPDATE succeeded and the event save
      // then threw, the store is partially written, so neither ref can be
      // trusted to authorise a skip. Nulling them makes the next change of any
      // kind — including reverting to the previous content — dirty, so the
      // editor can always recover.
      intendedRef.current = null;
      persistedRef.current = null;
      setSaveStatus('error');
    }
  }, [fingerprintOf]);

  const debouncedSave = useMemo(
    () => debounce(save, 2000),
    [save]
  );

  const handleChange = useCallback((data: TimelineData) => {
    const fp = fingerprintOf(data);

    // Nothing to do: either the store already holds this, or the write that
    // will make it hold this is already armed. Return before touching
    // saveStatus or hasUnsavedChanges — marking dirty here is what used to arm
    // the browser's "Leave site?" prompt just for opening a timeline. Don't
    // cancel the pending write either: when clean, that pending write *is* the
    // write for this content.
    if (fingerprintsEqual(intendedRef.current, fp)) return;

    // Advance at arm time, not on save success. Otherwise typing a character
    // and deleting it within the debounce window reads as clean on the way
    // back, leaving the already-armed write to commit the character the user
    // just removed, with nothing to reconcile it afterwards.
    intendedRef.current = fp;

    setHasUnsavedChanges(true);
    setSaveStatus('saving');
    debouncedSave(data);
  }, [debouncedSave, fingerprintOf]);

  // Commit any pending save now. Callers about to replace the editor's
  // contents (switching timelines) must call this — the debounced call holds a
  // snapshot of the *outgoing* timeline, and the next handleChange would
  // otherwise overwrite those arguments and discard them.
  const flushPendingSave = useCallback(async () => {
    await debouncedSave.flush();
  }, [debouncedSave]);

  // Drop the pending save without running it. Only correct when the target row
  // is going away (deleting a timeline), where committing would resurrect it.
  const cancelPendingSave = useCallback(() => {
    debouncedSave.cancel();
  }, [debouncedSave]);

  // Flush — not cancel — on unmount, so navigating away from the editor
  // doesn't drop the last edits.
  useEffect(() => {
    return () => {
      void debouncedSave.flush();
    };
  }, [debouncedSave]);

  // Add window beforeunload handler for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Add network status handler
  useEffect(() => {
    const handleOnline = () => {
      if (saveStatus === 'error' && hasUnsavedChanges) {
        // Retry save when we come back online
        save(timelineData);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [saveStatus, hasUnsavedChanges, timelineData, save]);

  return {
    saveStatus,
    lastSavedTime,
    handleChange,
    markClean,
    flushPendingSave,
    cancelPendingSave
  };
}