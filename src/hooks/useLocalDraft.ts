import { useCallback } from 'react';
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

export type { LocalDraft } from '../utils/draftStorage';

export function useLocalDraft() {
  const loadAllDrafts = useCallback((): LocalDraft[] => {
    return getAllDrafts();
  }, []);

  const loadDraft = useCallback((id: string): LocalDraft | null => {
    return getDraft(id);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saveDraft = useCallback(
    debounce((draft: LocalDraft) => {
      storageSaveDraft(draft);
    }, 500),
    []
  );

  const saveDraftImmediate = useCallback((draft: LocalDraft) => {
    storageSaveDraft(draft);
  }, []);

  // Commit a pending debounced save now. The debounced call holds a *snapshot*
  // of its arguments and each new call replaces them, so anything that is about
  // to change which draft is being edited — or to tear the page down — has to
  // flush first or that snapshot is silently discarded. localStorage writes are
  // synchronous, so this is safe to call from an unload handler.
  const flushDraftSave = useCallback(() => {
    saveDraft.flush();
  }, [saveDraft]);

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
