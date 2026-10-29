import { TimelineVerticalScale } from '../types/timeline';

export const VERTICAL_SCALES: Record<'small' | 'medium', TimelineVerticalScale> = {
  small: {
    value: 'small',
    eventRowHeight: 38
  },
  medium: {
    value: 'medium',
    eventRowHeight: 46
  }
};
