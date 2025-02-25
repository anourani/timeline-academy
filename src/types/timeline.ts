export interface Month {
  year: number;
  month: number;
}

export interface Timeline {
  id: string;
  title: string;
  updated_at: string | null;
  user_id: string;
  scale: 'large' | 'small';
}

export interface TimelineScale {
  value: 'large' | 'small';
  monthWidth: number;
  quarterWidth: number;
}