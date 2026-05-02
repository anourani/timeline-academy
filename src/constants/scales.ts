import { TimelineScale } from '../types/timeline';

export const SCALES: Record<'large' | 'medium' | 'small', TimelineScale> = {
  large: {
    value: 'large',
    monthWidth: 28,
    quarterWidth: 7
  },
  medium: {
    value: 'medium',
    monthWidth: 20,
    quarterWidth: 5
  },
  small: {
    value: 'small',
    monthWidth: 12,
    quarterWidth: 3
  }
};
