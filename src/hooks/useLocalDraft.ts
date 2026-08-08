import { useCallback, useEffect, useMemo, useRef } from 'react';
import { debounce } from '../utils/debounce';
import type { DraftStore, LocalDraft } from '../utils/draftStorage';
import {
  createEventsFingerprint,
  fingerprintsEqual,
  metaFingerprint,
  type Fingerprint,
} from '../utils/timelineFingerprint';

export type { LocalDraft } from '../utils/draftStorage';

/**
 * Draft CRUD against whichever browser store the current tier calls home —
 * localStorage for byok-anon, sessionStorage for the trial. The store is a
 * required argument rather than a defaulted one: picking the wrong home is
 * silent data loss, so every call site has to say which it means.
 */
export function useLocalDraft(store: DraftStore) {
  const eventsFpRef = useRef(createEventsFingerprint());
  // Id-keyed, because the baseline for one draft says nothing about another.
  const cleanRef = useRef<{ store: DraftStore; id: string; fp: Fingerprint | null } | null>(null);

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
    return store.getAllDrafts();
  }, [store]);

  const loadDraft = useCallback((id: string): LocalDraft | null => {
    return store.getDraft(id);
  }, [store]);

  const persistDraft = useMemo(
    () => debounce((draft: LocalDraft) => {
      store.saveDraft(draft);
    }, 500),
    [store]
  );

  // A pending write belongs to the store it was armed against, not to whichever
  // one the tier has since become. Adding a key mid-edit swaps trial for
  // byok-anon, and without this the last ≤500 ms would either land in the wrong
  // store or vanish — right before reconciliation reads the old one to migrate it.
  //
  // Cleanup captures the *previous* persistDraft, which still closes over the
  // previous store, so flushing here commits it to the correct home.
  useEffect(() => {
    return () => { persistDraft.flush(); };
  }, [persistDraft]);

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
    // out of the per-keystroke path. Keyed by store as well as id: the same
    // draft id exists in both stores across a migration, and a baseline taken
    // against the old one says nothing about the new one.
    if (cleanRef.current?.id !== draft.id || cleanRef.current?.store !== store) {
      const stored = store.getDraft(draft.id);
      cleanRef.current = { store, id: draft.id, fp: stored ? fingerprintOf(stored) : null };
    }

    if (fingerprintsEqual(cleanRef.current.fp, fp)) return;

    // Advanced at arm time, like the signed-in path: if this were advanced
    // only after the write, typing a character and deleting it inside the
    // 500 ms window would read as clean on the way back and let the armed
    // write commit the removed character.
    cleanRef.current = { store, id: draft.id, fp };
    persistDraft(draft);
  }, [fingerprintOf, persistDraft, store]);

  /**
   * Write now, no debounce. Returns false when the store refused the draft
   * because it is at capacity — migration relies on that answer to decide
   * whether it is safe to clear the source.
   */
  const saveDraftImmediate = useCallback((draft: LocalDraft): boolean => {
    const written = store.saveDraft(draft);
    if (written) {
      cleanRef.current = { store, id: draft.id, fp: fingerprintOf(draft) };
    }
    return written;
  }, [fingerprintOf, store]);

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

  /**
   * Throw away a pending write instead of committing it.
   *
   * The opposite of flushDraftSave, and almost always the wrong choice — the
   * one legitimate caller is discarding the draft the write belongs to, where
   * flushing would re-create in storage the very thing being deleted. Also
   * drops the fingerprint baseline, since it describes content that is about
   * to stop existing.
   */
  const cancelPendingDraftSave = useCallback(() => {
    persistDraft.cancel();
    cleanRef.current = null;
  }, [persistDraft]);

  const handleCreateDraft = useCallback((): LocalDraft | null => {
    return store.createDraft();
  }, [store]);

  const handleDeleteDraft = useCallback((id: string) => {
    store.deleteDraft(id);
  }, [store]);

  const handleClearAllDrafts = useCallback(() => {
    // Drop the baseline with the content it described, or the save effect can
    // re-arm against a fingerprint for a draft that no longer exists.
    cleanRef.current = null;
    store.clearAllDrafts();
  }, [store]);

  const handleGetDraftCount = useCallback((): number => {
    return store.getDraftCount();
  }, [store]);

  return {
    loadAllDrafts,
    loadDraft,
    saveDraft,
    saveDraftImmediate,
    flushDraftSave,
    cancelPendingDraftSave,
    createDraft: handleCreateDraft,
    deleteDraft: handleDeleteDraft,
    clearAllDrafts: handleClearAllDrafts,
    getDraftCount: handleGetDraftCount,
  };
}
