import { useState, useCallback } from 'react';
import { SCALES } from '../constants/scales';
import { TimelineScale } from '../types/timeline';

export function useTimelineScale(initialScale: 'large' | 'small' = 'large') {
  const [scale, setScale] = useState<'large' | 'small'>(initialScale);

  const handleScaleChange = useCallback((newScale: 'large' | 'small') => {
    setScale(newScale);
  }, []);

  const currentScale: TimelineScale = SCALES[scale];

  return {
    scale,
    currentScale,
    handleScaleChange
  };
}