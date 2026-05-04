import { useState, useCallback } from 'react';
import { VERTICAL_SCALES } from '../constants/verticalScales';
import { TimelineVerticalScale } from '../types/timeline';

export function useTimelineVerticalScale(initialScale: 'small' | 'medium' = 'small') {
  const [verticalScale, setVerticalScale] = useState<'small' | 'medium'>(initialScale);

  const handleVerticalScaleChange = useCallback((newScale: 'small' | 'medium') => {
    setVerticalScale(newScale);
  }, []);

  const currentVerticalScale: TimelineVerticalScale = VERTICAL_SCALES[verticalScale];

  return {
    verticalScale,
    currentVerticalScale,
    handleVerticalScaleChange
  };
}
