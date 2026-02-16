import { useCallback } from 'react';
import { debounce } from '../utils/debounce';
import type { TimelineEvent, CategoryConfig } from '../types/event';

const STORAGE_KEY = 'timeline_draft';

export interface LocalDraft {
  title: string;
  description: string;
  events: TimelineEvent[];
  categories: CategoryConfig[];
  scale: 'large' | 'small';
  savedAt: string;
}

export function useLocalDraft() {
  const loadDraft = useCallback((): LocalDraft | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as LocalDraft;
    } catch {
      return null;
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saveDraft = useCallback(
    debounce((draft: LocalDraft) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // Storage full or disabled — silently ignore
      }
    }, 500),
    []
  );

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  return { loadDraft, saveDraft, clearDraft };
}
