import { useState, useCallback } from 'react';
import { SCALES } from '../constants/scales';
import { TimelineScale } from '../types/timeline';

export function useTimelineScale(initialScale: 'large' | 'medium' | 'small' = 'small') {
  const [scale, setScale] = useState<'large' | 'medium' | 'small'>(initialScale);

  const handleScaleChange = useCallback((newScale: 'large' | 'medium' | 'small') => {
    setScale(newScale);
  }, []);

  const currentScale: TimelineScale = SCALES[scale];

  return {
    scale,
    currentScale,
    handleScaleChange
  };
}