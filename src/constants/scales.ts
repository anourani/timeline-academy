import { TimelineScale } from '../types/timeline';

export const SCALES: Record<'large' | 'small', TimelineScale> = {
  large: {
    value: 'large',
    monthWidth: 32,
    quarterWidth: 8
  },
  small: {
    value: 'small',
    monthWidth: 26,
    quarterWidth: 6.5
  }
};