import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getTimelineYearRange } from '../utils/timelineUtils';
import { TimelineCategory } from '../types/event';
import { DEFAULT_CATEGORIES } from '../constants/categories';
import { computeDominantCategoryColor, DEFAULT_DOT_COLOR } from '../utils/dominantCategory';

export interface TimelineMetadata {
  eventCount: number;
  yearRange: string;
  dominantCategoryColor: string;
}

function emptyMetadata(): TimelineMetadata {
  return {
    eventCount: 0,
    yearRange: new Date().getFullYear().toString(),
    dominantCategoryColor: DEFAULT_DOT_COLOR,
  };
}

/**
 * Per-timeline event count, year range and dominant category colour, for the
 * side panel's tiles.
 *
 * The fetch is keyed on the *set* of timeline ids, so a timeline's contents
 * changing is invisible to it by construction — and there is deliberately no
 * subscription to the `events` table here. Two escape hatches keep the numbers
 * current instead:
 *
 * - `applyLocalMetadata` lets the editor write through what it already knows
 *   about the timeline it has open, so those numbers survive the user switching
 *   away from it. Without it the tile falls back to whatever was fetched when
 *   the page loaded, and the badge visibly reverts.
 * - `refresh` forces a real refetch, for the moments where a round trip is
 *   warranted (the panel opening, an explicit refresh from the editor).
 */
export function useTimelineMetadata(timelineIds: string[]) {
  const [metadata, setMetadata] = useState<Map<string, TimelineMetadata>>(new Map());
  const [nonce, setNonce] = useState(0);
  const prevFetchKeyRef = useRef('');
  const seqRef = useRef(0);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  const applyLocalMetadata = useCallback((id: string, patch: Partial<TimelineMetadata>) => {
    setMetadata(prev => {
      const existing = prev.get(id);
      const merged = { ...(existing ?? emptyMetadata()), ...patch };
      // Bail without allocating when nothing actually moved — this runs on
      // every keystroke that changes the open timeline.
      if (
        existing &&
        merged.eventCount === existing.eventCount &&
        merged.yearRange === existing.yearRange &&
        merged.dominantCategoryColor === existing.dominantCategoryColor
      ) {
        return prev;
      }
      const next = new Map(prev);
      next.set(id, merged);
      return next;
    });
  }, []);

  useEffect(() => {
    // Keyed on the *set* of ids, so the ids are sorted first — the list itself
    // re-sorts whenever a timeline is edited, and an order-sensitive key would
    // turn every reorder into two needless queries plus a full map replacement
    // that discards the write-through values applyLocalMetadata just put there.
    //
    // `nonce` is part of the key so refresh() forces a fetch the set check
    // would otherwise skip.
    const fetchKey = `${nonce}:${[...timelineIds].sort().join(',')}`;
    if (fetchKey === prevFetchKeyRef.current) return;
    // Latched up front so `timelineIds` identity churn doesn't re-fire the
    // request; the error path below unlatches it again.
    prevFetchKeyRef.current = fetchKey;

    if (timelineIds.length === 0) {
      setMetadata(new Map());
      return;
    }

    const seq = ++seqRef.current;

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

      // A newer fetch has superseded this one. These genuinely overlap when the
      // synthetic active row appears and then disappears, and without this the
      // older response can land last and win.
      if (seq !== seqRef.current) return;

      if (eventsResult.error) {
        console.error('Error fetching timeline metadata:', eventsResult.error);
        // Unlatch so the next id change or refresh() retries. Leaving this
        // latched meant a single transient failure froze every badge at 0 for
        // the rest of the page's life.
        prevFetchKeyRef.current = '';
        return;
      }

      if (timelinesResult.error) {
        // Not fatal — every dot just falls back to the default palette — but it
        // used to be swallowed silently, which made the cause impossible to see.
        console.error('Error fetching timeline categories:', timelinesResult.error);
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
        result.set(id, emptyMetadata());
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

        const dominantCategoryColor = computeDominantCategoryColor(
          events,
          timelineCategoriesMap.get(timelineId) ?? DEFAULT_CATEGORIES,
        );

        result.set(timelineId, {
          eventCount: events.length,
          yearRange: getTimelineYearRange(asTimelineEvents),
          dominantCategoryColor,
        });
      }

      setMetadata(result);
    };

    fetchMetadata();
  }, [timelineIds, nonce]);

  return { metadata, applyLocalMetadata, refresh };
}
