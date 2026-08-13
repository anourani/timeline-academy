import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { TimelineEvent, CategoryConfig } from '../types/event';
import { useAuth } from './useAuth';
import { DEFAULT_TIMELINE_TITLE } from '../constants/defaults';
import { notifyUsageChanged } from '../utils/usageChanged';
import {
  LimitReachedError,
  getCurrentLimits,
  isOverEventLimit,
  isOverTimelineLimit,
} from '../lib/limits';

async function checkCreateTimelineLimits(userId: string): Promise<void> {
  const [eventsResult, timelinesResult] = await Promise.all([
    supabase.rpc('get_user_event_count'),
    supabase
      .from('timelines')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (timelinesResult.error) throw timelinesResult.error;

  const { eventLimit, timelineLimit } = getCurrentLimits();
  const eventCount = typeof eventsResult.data === 'number' ? eventsResult.data : 0;
  const timelineCount = timelinesResult.count ?? 0;

  if (isOverTimelineLimit(timelineCount)) {
    throw new LimitReachedError('timeline', timelineLimit ?? 0);
  }
  if (isOverEventLimit(eventCount)) {
    throw new LimitReachedError('event', eventLimit ?? 0);
  }
}

export interface TimelineData {
  /**
   * The row this data actually came from. Callers must bind their "currently
   * open timeline" to this value and nothing else — see the note below.
   */
  id: string;
  title: string;
  description?: string;
  events: TimelineEvent[];
  categories?: CategoryConfig[];
  scale?: 'large' | 'medium' | 'small';
  verticalScale?: 'small' | 'medium';
  groupByCategory?: boolean;
}

/**
 * Timeline record I/O.
 *
 * This hook deliberately holds **no "current timeline" state**. It used to keep
 * a `timelineId` that was written in three places — including a mount effect
 * that picked an arbitrary row, and a `setTimelineId(id)` that fired before the
 * data it named had loaded. Because autosave keyed off that pointer while
 * reading the editor's separately-held contents, the two could disagree, and a
 * save would then write one timeline's title and events onto a different
 * timeline's row (deleting the victim's events, since the event save is a
 * diff).
 *
 * Every function here therefore *returns* an id rather than storing one. The
 * caller is responsible for keeping the id and the contents it came with in a
 * single atomic piece of state.
 */
export function useTimeline() {
  const { user } = useAuth();

  /**
   * The most recently updated timeline for this user, or null if they have
   * none. Ordered, unlike the arbitrary `.limit(1)` this replaces, so landing
   * on `/editor` with no route state is at least deterministic.
   */
  const getMostRecentTimelineId = useCallback(async (): Promise<string | null> => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('timelines')
      .select('id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return data?.id ?? null;
  }, [user]);

  const loadTimeline = useCallback(async (id: string): Promise<TimelineData> => {
    if (!user) throw new Error('Must be signed in to load timeline');

    if (id === 'new') {
      await checkCreateTimelineLimits(user.id);

      // Write the display defaults explicitly rather than leaning on the
      // column defaults, which differ ('large' / 'small'). Autosave used to
      // paper over the mismatch by immediately rewriting the row on open; now
      // that opening a timeline no longer writes, an untouched new timeline
      // would keep the column defaults while the editor showed these — and
      // reopening it would visibly change zoom.
      const { data: newTimeline, error: createError } = await supabase
        .from('timelines')
        .insert({
          title: DEFAULT_TIMELINE_TITLE,
          user_id: user.id,
          scale: 'small',
          vertical_scale: 'medium',
          group_by_category: false,
        })
        .select('id')
        .single();

      if (createError) throw createError;

      // One more row against the timeline cap.
      notifyUsageChanged();

      return {
        id: newTimeline.id,
        title: DEFAULT_TIMELINE_TITLE,
        description: '',
        events: [],
        categories: undefined, // Will use default categories
        scale: 'small',
        verticalScale: 'medium',
        groupByCategory: false
      };
    }

    const { data: timeline, error: timelineError } = await supabase
      .from('timelines')
      .select('*')
      .eq('id', id)
      .single();

    if (timelineError) throw timelineError;

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .eq('timeline_id', id);

    if (eventsError) throw eventsError;

    return {
      id,
      title: timeline.title,
      description: timeline.description || '',
      events: events.map(event => ({
        id: event.id,
        title: event.title,
        startDate: event.start_date,
        endDate: event.end_date,
        category: event.category,
        description: event.description ?? null,
        imageUrl: event.image_url ?? null,
        imageAttribution: event.image_attribution ?? null,
        sources: event.sources ?? null,
      })),
      // Categories come off the timelines row itself, from the `categories`
      // jsonb column — the same one the side panel's dominant-colour query
      // reads, so the editor and the tile can no longer disagree about them.
      //
      // This used to be a third round trip to a separate `timeline_categories`
      // table that nothing has ever written. It always came back `[]`, whose
      // truthiness then wiped the editor's categories on every load, and its
      // row shape (`category_id`, `order`) was never `CategoryConfig` anyway.
      //
      // Empty normalises to undefined so the editor falls back to defaults.
      categories: Array.isArray(timeline.categories) && timeline.categories.length > 0
        ? timeline.categories
        : undefined,
      scale: timeline.scale || 'large',
      verticalScale: timeline.vertical_scale || 'medium',
      groupByCategory: timeline.group_by_category ?? false
    };
  }, [user]);

  /**
   * Unconditionally create a new timeline row from the given data and return
   * its id. Used by the local-draft migration on login, which always wants a
   * fresh row — the previous implementation branched on the hook's internal
   * `timelineId` and would *overwrite* an existing timeline when that pointer
   * happened to be set.
   */
  const createTimelineFrom = useCallback(async (
    title: string,
    events: TimelineEvent[],
    scale: 'large' | 'medium' | 'small' = 'small',
    verticalScale: 'small' | 'medium' = 'medium',
  ): Promise<string> => {
    if (!user) throw new Error('Must be signed in to save');

    await checkCreateTimelineLimits(user.id);

    const { data: timeline, error: timelineError } = await supabase
      .from('timelines')
      .insert({ title, user_id: user.id, scale, vertical_scale: verticalScale })
      .select('id')
      .single();

    if (timelineError) throw timelineError;

    // Insert events with client-generated IDs
    if (events.length > 0) {
      const { error: eventsError } = await supabase
        .from('events')
        .insert(
          events.map(event => ({
            id: event.id,
            timeline_id: timeline.id,
            title: event.title,
            start_date: event.startDate,
            end_date: event.endDate,
            category: event.category
          }))
        );

      if (eventsError) throw eventsError;
    }

    // After both writes, so one recount covers the new timeline and its events.
    notifyUsageChanged();

    return timeline.id;
  }, [user]);

  return {
    getMostRecentTimelineId,
    createTimelineFrom,
    loadTimeline
  };
}
