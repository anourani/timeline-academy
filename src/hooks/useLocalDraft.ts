import { useCallback, useRef } from 'react';
import { debounce } from '../utils/debounce';
import {
  migrateFromLegacy,
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
  const migratedRef = useRef(false);

  const ensureMigrated = useCallback(() => {
    if (!migratedRef.current) {
      migrateFromLegacy();
      migratedRef.current = true;
    }
  }, []);

  const loadAllDrafts = useCallback((): LocalDraft[] => {
    ensureMigrated();
    return getAllDrafts();
  }, [ensureMigrated]);

  const loadDraft = useCallback((id: string): LocalDraft | null => {
    ensureMigrated();
    return getDraft(id);
  }, [ensureMigrated]);

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
    ensureMigrated();
    return createDraft();
  }, [ensureMigrated]);

  const handleDeleteDraft = useCallback((id: string) => {
    deleteDraft(id);
  }, []);

  const handleClearAllDrafts = useCallback(() => {
    clearAllDrafts();
  }, []);

  const handleGetDraftCount = useCallback((): number => {
    ensureMigrated();
    return getDraftCount();
  }, [ensureMigrated]);

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
