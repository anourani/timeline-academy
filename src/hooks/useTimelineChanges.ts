import { useState, useEffect } from 'react';
import { TimelineEvent, CategoryConfig } from '../types/event';

interface TimelineState {
  title: string;
  description: string;
  events: TimelineEvent[];
  categories: CategoryConfig[];
  scale: 'large' | 'small';
}

export function useTimelineChanges(
  currentState: {
    title: string;
    description: string;
    events: TimelineEvent[];
    categories: CategoryConfig[];
    scale: 'large' | 'small';
  }
) {
  const [initialState, setInitialState] = useState<TimelineState>({
    title: currentState.title,
    description: currentState.description,
    events: [...currentState.events],
    categories: [...currentState.categories],
    scale: currentState.scale
  });

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const eventsChanged = JSON.stringify(currentState.events) !== JSON.stringify(initialState.events);
    const categoriesChanged = JSON.stringify(currentState.categories) !== JSON.stringify(initialState.categories);
    const titleChanged = currentState.title !== initialState.title;
    const descriptionChanged = currentState.description !== initialState.description;
    const scaleChanged = currentState.scale !== initialState.scale;

    const hasAnyChanges = eventsChanged || 
                         categoriesChanged || 
                         titleChanged || 
                         descriptionChanged || 
                         scaleChanged;

    setHasChanges(hasAnyChanges);
  }, [
    currentState.title,
    currentState.description,
    currentState.events,
    currentState.categories,
    currentState.scale,
    initialState
  ]);

  const markAsSaved = () => {
    setInitialState({
      title: currentState.title,
      description: currentState.description,
      events: [...currentState.events],
      categories: [...currentState.categories],
      scale: currentState.scale
    });
    setHasChanges(false);
  };

  const resetChanges = () => {
    setInitialState({
      title: currentState.title,
      description: currentState.description,
      events: [...currentState.events],
      categories: [...currentState.categories],
      scale: currentState.scale
    });
    setHasChanges(false);
  };

  return { hasChanges, markAsSaved, resetChanges };
}