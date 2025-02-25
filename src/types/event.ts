export interface TimelineEvent {
  id: string;
  title: string;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  category: TimelineCategory;
}

export type TimelineCategory = 'personal' | 'career' | 'education' | 'home';

export interface CategoryConfig {
  id: TimelineCategory;
  label: string;
  color: string;
  visible: boolean;
}