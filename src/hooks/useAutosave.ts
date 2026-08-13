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
import { notifyTimelineSaved } from '../utils/timelineSaved';
import { notifyUsageChanged } from '../utils/usageChanged';
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

/**
 * What the caller must supply to declare the editor clean.
 *
 * Categories are part of it now that autosave persists them. Anything absent
 * here is absent from the fingerprint, so a field that the store writes but the
 * baseline omits makes every load look dirty and write itself straight back —
 * which is how merely opening a timeline used to reorder the side panel.
 */
export type CleanState = TimelineData;

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
    // `categories` is included because autosave now writes them to
    // `timelines.categories`. It used to be excluded, correctly, for the
    // opposite reason — nothing persisted them, so counting a category edit as
    // dirty would have armed a write that changed nothing in the store.
    meta: metaFingerprint({
      id: data.id ?? '',
      title: data.title,
      description: data.description,
      scale: data.scale,
      verticalScale: data.verticalScale,
      groupByCategory: data.groupByCategory,
      categories: data.categories,
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
      
      // First update the timeline.
      //
      // `updated_at` is still sent from the client. Where the ordering
      // migration has been applied a trigger stamps it server-side instead, but
      // nothing in this repo can verify that it has been — so the client keeps
      // supplying a value, and the `.select()` reads back whichever one won.
      const { data: savedRow, error: timelineError } = await supabase
        .from('timelines')
        .update({
          title: data.title,
          description: data.description,
          categories: data.categories,
          scale: data.scale,
          vertical_scale: data.verticalScale,
          group_by_category: data.groupByCategory,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.id)
        .select('updated_at')
        // maybeSingle, not single: the row can already be gone when a pending
        // save flushes — deleting from the side panel doesn't cancel it, and
        // navigating away flushes on unmount. That is a silent no-op today, and
        // `single` would turn it into a new throw.
        .maybeSingle();

      if (timelineError) throw timelineError;

      // Announce the bump here, before the event save rather than after the
      // whole thing succeeds. These are separate HTTP calls: by this point
      // `updated_at` has already moved in the database, whether or not the
      // events below land. The side panel sorts on what the row actually holds,
      // so it has to hear about it either way — and if the event save throws,
      // the store is partially written and the row genuinely is the most
      // recently touched one. Save success is a different fact, and it is
      // already reported through `saveStatus`.
      if (savedRow?.updated_at) {
        notifyTimelineSaved({ id: data.id, updatedAt: savedRow.updated_at });
      }

      // Diff-based event save
      await saveTimelineEvents(data.id, data.events);

      // After the event save, not beside the bump above: this one reports how
      // many events now exist, and above they had not been written yet.
      notifyUsageChanged();

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