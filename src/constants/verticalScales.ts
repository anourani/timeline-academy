import { TimelineVerticalScale } from '../types/timeline';

export const VERTICAL_SCALES: Record<'small' | 'medium', TimelineVerticalScale> = {
  small: {
    value: 'small',
    eventHeight: 36,
    eventRowHeight: 38
  },
  medium: {
    value: 'medium',
    eventHeight: 44,
    eventRowHeight: 46
  }
};
