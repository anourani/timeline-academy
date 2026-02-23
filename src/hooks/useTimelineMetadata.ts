import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getTimelineYearRange } from '../utils/timelineUtils';
import { TimelineCategory } from '../types/event';

export interface TimelineMetadata {
  eventCount: number;
  yearRange: string;
}

export function useTimelineMetadata(timelineIds: string[]): Map<string, TimelineMetadata> {
  const [metadata, setMetadata] = useState<Map<string, TimelineMetadata>>(new Map());

  useEffect(() => {
    if (timelineIds.length === 0) {
      setMetadata(new Map());
      return;
    }

    const fetchMetadata = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('timeline_id, start_date, end_date')
        .in('timeline_id', timelineIds);

      if (error) {
        console.error('Error fetching timeline metadata:', error);
        return;
      }

      const result = new Map<string, TimelineMetadata>();

      // Initialize all timelines with defaults (so 0-event timelines get entries)
      for (const id of timelineIds) {
        result.set(id, {
          eventCount: 0,
          yearRange: new Date().getFullYear().toString(),
        });
      }

      // Group events by timeline_id
      const eventsByTimeline = new Map<string, Array<{ start_date: string; end_date: string }>>();
      for (const event of data || []) {
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
          category: 'personal' as TimelineCategory,
        }));

        result.set(timelineId, {
          eventCount: events.length,
          yearRange: getTimelineYearRange(asTimelineEvents),
        });
      }

      setMetadata(result);
    };

    fetchMetadata();
  }, [JSON.stringify(timelineIds)]);

  return metadata;
}
