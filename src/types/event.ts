export interface TimelineEvent {
  id: string;
  title: string;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  category: TimelineCategory;
}

export type TimelineCategory = 'category_1' | 'category_2' | 'category_3' | 'category_4';

export interface CategoryConfig {
  id: TimelineCategory;
  label: string;
  color: string;
  visible: boolean;
}