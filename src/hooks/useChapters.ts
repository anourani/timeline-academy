import { useState, useCallback } from 'react';
import { TimelineChapter } from '../types/timeline';

/**
 * Chapters for the current timeline.
 *
 * Mirrors useCategories: pure local state, no I/O — loading and saving belong
 * to useTimeline and useAutosave. Unlike categories there is no default set:
 * a timeline that was never AI-generated genuinely has no chapters, and the
 * strip renders nothing rather than inventing spans.
 */
export function useChapters() {
  const [chapters, setChapters] = useState<TimelineChapter[]>([]);

  const updateChapters = useCallback((newChapters: TimelineChapter[] | undefined) => {
    setChapters(newChapters?.length ? newChapters : []);
  }, []);

  const resetChapters = useCallback(() => {
    setChapters([]);
  }, []);

  return { chapters, updateChapters, resetChapters };
}
