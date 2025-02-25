import { useState, useCallback } from 'react';
import { DEFAULT_TIMELINE_TITLE } from '../constants/defaults';

interface TimelineState {
  title: string;
  description: string;
}

export function useTimelineTitle() {
  const [state, setState] = useState<TimelineState>(() => ({
    title: DEFAULT_TIMELINE_TITLE,
    description: ''
  }));

  const setTitle = useCallback((title: string) => {
    setState(prev => ({ ...prev, title }));
  }, []);

  const setDescription = useCallback((description: string) => {
    setState(prev => ({ ...prev, description }));
  }, []);

  const resetTitle = useCallback(() => {
    setState({
      title: DEFAULT_TIMELINE_TITLE,
      description: ''
    });
  }, []);

  return { 
    title: state.title, 
    description: state.description,
    setTitle,
    setDescription,
    resetTitle
  };
}