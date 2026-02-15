import { useState, useCallback, useEffect } from 'react';
import { debounce } from '../utils/debounce';
import { supabase } from '../lib/supabase';
import { saveTimelineEvents } from '../utils/saveEvents';
import type { SaveStatus } from '../components/SaveStatusIndicator/SaveStatusIndicator';
import type { TimelineEvent, CategoryConfig } from '../types/event';

interface TimelineData {
  id: string | null;
  title: string;
  description: string;
  events: TimelineEvent[];
  categories: CategoryConfig[];
  scale: 'large' | 'small';
}

export function useAutosave(timelineData: TimelineData) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<Date>();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const save = async (data: TimelineData) => {
    if (!data.id) return;

    try {
      setSaveStatus('saving');
      
      // First update the timeline
      const { error: timelineError } = await supabase
        .from('timelines')
        .update({
          title: data.title,
          description: data.description,
          scale: data.scale,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.id);

      if (timelineError) throw timelineError;

      // Diff-based event save
      await saveTimelineEvents(data.id, data.events);

      const now = new Date();
      setSaveStatus('saved');
      setLastSavedTime(now);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('error');
    }
  };

  const debouncedSave = useCallback(
    debounce(save, 2000),
    []
  );

  const handleChange = useCallback((data: TimelineData) => {
    setHasUnsavedChanges(true);
    setSaveStatus('saving');
    debouncedSave(data);
  }, [debouncedSave]);

  // Clean up debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
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
  }, [saveStatus, hasUnsavedChanges, timelineData]);

  return {
    saveStatus,
    lastSavedTime,
    handleChange
  };
}