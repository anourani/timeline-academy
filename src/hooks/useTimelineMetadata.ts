import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getTimelineYearRange } from '../utils/timelineUtils';
import { TimelineCategory } from '../types/event';
import { DEFAULT_CATEGORIES } from '../constants/categories';

export interface TimelineMetadata {
  eventCount: number;
  yearRange: string;
  dominantCategoryColor: string;
}

const DEFAULT_DOT_COLOR = '#4196E4';

export function useTimelineMetadata(timelineIds: string[]): Map<string, TimelineMetadata> {
  const [metadata, setMetadata] = useState<Map<string, TimelineMetadata>>(new Map());
  const prevIdsKeyRef = useRef('');

  useEffect(() => {
    const idsKey = JSON.stringify(timelineIds);
    if (idsKey === prevIdsKeyRef.current) return;
    prevIdsKeyRef.current = idsKey;

    if (timelineIds.length === 0) {
      setMetadata(new Map());
      return;
    }

    const fetchMetadata = async () => {
      const [eventsResult, timelinesResult] = await Promise.all([
        supabase
          .from('events')
          .select('timeline_id, start_date, end_date, category')
          .in('timeline_id', timelineIds),
        supabase
          .from('timelines')
          .select('id, categories')
          .in('id', timelineIds),
      ]);

      if (eventsResult.error) {
        console.error('Error fetching timeline metadata:', eventsResult.error);
        return;
      }

      // Build a map of timeline-specific category configs
      const timelineCategoriesMap = new Map<string, typeof DEFAULT_CATEGORIES>();
      for (const t of timelinesResult.data || []) {
        if (t.categories && Array.isArray(t.categories)) {
          timelineCategoriesMap.set(t.id, t.categories);
        }
      }

      const result = new Map<string, TimelineMetadata>();

      // Initialize all timelines with defaults (so 0-event timelines get entries)
      for (const id of timelineIds) {
        result.set(id, {
          eventCount: 0,
          yearRange: new Date().getFullYear().toString(),
          dominantCategoryColor: DEFAULT_DOT_COLOR,
        });
      }

      // Group events by timeline_id
      const eventsByTimeline = new Map<string, Array<{ start_date: string; end_date: string; category: string }>>();
      for (const event of eventsResult.data || []) {
        const existing = eventsByTimeline.get(event.timeline_id) || [];
        existing.push(event);
        eventsByTimeline.set(event.timeline_id, existing);
      }

      // Compute metadata per timeline
      for (const [timelineId, events] of eventsByTimeline) {
        const asTimelineEvents = events.map(e => ({
          id: '',
          title: '',
          startDate: e.start_date,
          endDate: e.end_date || e.start_date,
          category: 'category_1' as TimelineCategory,
        }));

        // Find dominant category color
        const categoryCounts = new Map<string, number>();
        for (const e of events) {
          if (e.category) {
            categoryCounts.set(e.category, (categoryCounts.get(e.category) || 0) + 1);
          }
        }
        let dominantCategoryColor = DEFAULT_DOT_COLOR;
        if (categoryCounts.size > 0) {
          let maxCount = 0;
          let dominantCategoryId = '';
          for (const [catId, count] of categoryCounts) {
            if (count > maxCount) {
              maxCount = count;
              dominantCategoryId = catId;
            }
          }
          const categories = timelineCategoriesMap.get(timelineId) || DEFAULT_CATEGORIES;
          const category = categories.find(c => c.id === dominantCategoryId);
          if (category) {
            dominantCategoryColor = category.color;
          }
        }

        result.set(timelineId, {
          eventCount: events.length,
          yearRange: getTimelineYearRange(asTimelineEvents),
          dominantCategoryColor,
        });
      }

      setMetadata(result);
    };

    fetchMetadata();
  }, [timelineIds]);

  return metadata;
}
