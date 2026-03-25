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
    createDraft: handleCreateDraft,
    deleteDraft: handleDeleteDraft,
    clearAllDrafts: handleClearAllDrafts,
    getDraftCount: handleGetDraftCount,
  };
}
