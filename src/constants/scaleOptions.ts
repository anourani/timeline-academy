import type { SegmentedOption } from '@/components/ui/SegmentedControl'

export type TimelineScaleValue = 'large' | 'medium' | 'small'
export type VerticalScaleValue = 'small' | 'medium'

// Single glyphs, because the row is a label and a control side by side and the
// words crowded it. `name` carries the word through to the tooltip and the
// accessible name, so nothing is lost — see `SegmentedControl`.
export const SCALE_OPTIONS: SegmentedOption<TimelineScaleValue>[] = [
  { value: 'small', label: 'S', name: 'Small' },
  { value: 'medium', label: 'M', name: 'Medium' },
  { value: 'large', label: 'L', name: 'Large' },
]

export const VERTICAL_SCALE_OPTIONS: SegmentedOption<VerticalScaleValue>[] = [
  { value: 'small', label: 'S', name: 'Small' },
  { value: 'medium', label: 'M', name: 'Medium' },
]
