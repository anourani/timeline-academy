import { TimelineScale } from '../types/timeline';

export const SCALES: Record<'large' | 'small', TimelineScale> = {
  large: {
    value: 'large',
    monthWidth: 28,
    quarterWidth: 7
  },
  small: {
    value: 'small',
    monthWidth: 20,
    quarterWidth: 5
  }
};