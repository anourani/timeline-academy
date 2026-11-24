export interface EventSource {
  title: string;
  url: string;
}

/** One photo in the event view's gallery (src/services/wikipediaPhotos.ts). */
export interface EventPhoto {
  url: string;
  /** A smaller rendition for the thumbnail row; falls back to `url`. */
  thumbUrl?: string | null;
  /** What the photo shows — from the file's description on Wikimedia. */
  caption?: string | null;
  /** "Photo: Author / Licence", as wikipediaImage.ts builds it. */
  attribution: string | null;
}

export interface TimelineEvent {
  id: string;
  title: string;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  category: TimelineCategory;
  // AI-generated detail fields. Populated only after the user opens
  // "Open details" on an event in edit mode and the enrichment completes.
  description?: string | null;
  imageUrl?: string | null;
  imageAttribution?: string | null;
  sources?: EventSource[] | null;
}

/**
 * What event enrichment and the detail panel need: an event without its
 * category. Real events and World Events entries (which belong to no
 * category) both fit.
 */
export type EnrichableEvent = Omit<TimelineEvent, 'category'>;

export type TimelineCategory = 'category_1' | 'category_2' | 'category_3' | 'category_4';

export interface CategoryConfig {
  id: TimelineCategory;
  label: string;
  color: string;
  visible: boolean;
}
