import { useCallback, useRef } from 'react';
import { debounce } from '../utils/debounce';
import {
  getAllDrafts,
  getDraft,
  getDraftCount,
  createDraft,
  saveDraft as storageSaveDraft,
  deleteDraft,
  clearAllDrafts,
} from '../utils/draftStorage';
import type { LocalDraft } from '../utils/draftStorage';
import {
  createEventsFingerprint,
  fingerprintsEqual,
  metaFingerprint,
  type Fingerprint,
} from '../utils/timelineFingerprint';

export type { LocalDraft } from '../utils/draftStorage';

export function useLocalDraft() {
  const eventsFpRef = useRef(createEventsFingerprint());
  // Id-keyed, because the baseline for one draft says nothing about another.
  const cleanRef = useRef<{ id: string; fp: Fingerprint | null } | null>(null);

  const fingerprintOf = useCallback((draft: LocalDraft): Fingerprint => ({
    // Unlike the signed-in path, categories ARE included: LocalDraft persists
    // them and loadDraft restores them, so a category edit really is an edit.
    //
    // The `??` fallbacks must match the hydration branches in App.tsx exactly
    // (note they use 'medium' for verticalScale where the signed-in path uses
    // 'small'). If they drift, a draft written before those optional fields
    // existed fingerprints dirty the moment it is opened and bumps `savedAt` —
    // which is precisely the reordering bug this is meant to stop.
    meta: metaFingerprint({
      id: draft.id,
      title: draft.title ?? '',
      description: draft.description ?? '',
      scale: draft.scale,
      verticalScale: draft.verticalScale ?? 'medium',
      groupByCategory: draft.groupByCategory ?? false,
      categories: draft.categories,
    }),
    events: eventsFpRef.current(draft.events),
  }), []);
  const loadAllDrafts = useCallback((): LocalDraft[] => {
    return getAllDrafts();
  }, []);

  const loadDraft = useCallback((id: string): LocalDraft | null => {
    return getDraft(id);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const persistDraft = useCallback(
    debounce((draft: LocalDraft) => {
      storageSaveDraft(draft);
    }, 500),
    []
  );

  /**
   * Save unless the stored draft already matches.
   *
   * The baseline seeds itself from storage rather than from a hydration
   * callback: for a synchronous store the honest answer to "what's saved?" is
   * the store itself, and the editor hydrates drafts from five different
   * branches with no single funnel to hook.
   */
  const saveDraft = useCallback((draft: LocalDraft) => {
    const fp = fingerprintOf(draft);

    // Reseed only when the draft changes, so the full-blob JSON.parse stays
    // out of the per-keystroke path.
    if (cleanRef.current?.id !== draft.id) {
      const stored = getDraft(draft.id);
      cleanRef.current = { id: draft.id, fp: stored ? fingerprintOf(stored) : null };
    }

    if (fingerprintsEqual(cleanRef.current.fp, fp)) return;

    // Advanced at arm time, like the signed-in path: if this were advanced
    // only after the write, typing a character and deleting it inside the
    // 500 ms window would read as clean on the way back and let the armed
    // write commit the removed character.
    cleanRef.current = { id: draft.id, fp };
    persistDraft(draft);
  }, [fingerprintOf, persistDraft]);

  const saveDraftImmediate = useCallback((draft: LocalDraft) => {
    storageSaveDraft(draft);
    cleanRef.current = { id: draft.id, fp: fingerprintOf(draft) };
  }, [fingerprintOf]);

  // Commit a pending debounced save now. The debounced call holds a *snapshot*
  // of its arguments and each new call replaces them, so anything that is about
  // to change which draft is being edited — or to tear the page down — has to
  // flush first or that snapshot is silently discarded. localStorage writes are
  // synchronous, so this is safe to call from an unload handler.
  const flushDraftSave = useCallback(() => {
    // No-ops on its own when nothing is armed, which is exactly what a clean
    // editor produces now that saveDraft skips unchanged drafts.
    persistDraft.flush();
  }, [persistDraft]);

  const handleCreateDraft = useCallback((): LocalDraft | null => {
    return createDraft();
  }, []);

  const handleDeleteDraft = useCallback((id: string) => {
    deleteDraft(id);
  }, []);

  const handleClearAllDrafts = useCallback(() => {
    clearAllDrafts();
  }, []);

  const handleGetDraftCount = useCallback((): number => {
    return getDraftCount();
  }, []);

  return {
    loadAllDrafts,
    loadDraft,
    saveDraft,
    saveDraftImmediate,
    flushDraftSave,
    createDraft: handleCreateDraft,
    deleteDraft: handleDeleteDraft,
    clearAllDrafts: handleClearAllDrafts,
    getDraftCount: handleGetDraftCount,
  };
}
