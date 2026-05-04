export interface Month {
  year: number;
  month: number;
}

export interface Timeline {
  id: string;
  title: string;
  updated_at: string | null;
  user_id: string;
  scale: 'large' | 'medium' | 'small';
  verticalScale: 'small' | 'medium';
}

export interface TimelineScale {
  value: 'large' | 'medium' | 'small';
  monthWidth: number;
  quarterWidth: number;
}

export interface TimelineVerticalScale {
  value: 'small' | 'medium';
  eventHeight: number;
  eventRowHeight: number;
}