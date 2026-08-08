import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Timeline } from '../types/timeline';
import { useAuth } from './useAuth';
import { onTimelineSaved } from '../utils/timelineSaved';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Sort key for the side panel: most recently edited first.
 *
 * Compares parsed instants, never the raw strings. The REST fetch returns
 * PostgREST's ISO-8601 (`...T12:34:56+00:00`) but the realtime payload's
 * timestamp formatting is not guaranteed to match it, and space-separated
 * variants have shipped historically. `' '` sorts below `'T'`, so a
 * lexicographic comparison across the two forms would send the timeline the
 * user *just* edited to the bottom of the list.
 *
 * If you ever see the edited timeline sink instead of rise, there are two
 * suspects: Date.parse returning NaN on the realtime format — start here — or
 * the save echo below never arriving, which is what `savedFloorRef` exists for.
 */
function toTime(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function byUpdatedAtDesc(a: Timeline, b: Timeline): number {
  return toTime(b.updated_at) - toTime(a.updated_at);
}

export function useTimelines() {
  const { user } = useAuth();
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Latest `updated_at` this tab has *seen a write confirm*, per timeline id.
  //
  // Not redundant with the state above, and not solvable by the sequence guard
  // either. The race it covers is a single fetch whose response was generated
  // before the write and resolves after it: there is no second request for the
  // sequence to reject, so the stale array lands and wholesale-replaces the
  // freshly sorted one. Applying the floor as rows are mapped in means such a
  // response can no longer walk the order backwards.
  const savedFloorRef = useRef<Map<string, string>>(new Map());
  // Rejects responses that a newer request has already superseded — the same
  // guard useTimelineMetadata carries, which this hook was missing entirely.
  const seqRef = useRef(0);

  const loadTimelines = useCallback(async (retryCount = 0) => {
    if (!user) {
      // Bump the sequence here too, or a fetch still in flight for the previous
      // account lands after sign-out and repopulates the panel with their rows.
      seqRef.current += 1;
      savedFloorRef.current.clear();
      setTimelines([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const seq = ++seqRef.current;

    try {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('timelines')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      // A newer request — or a sign-out — has superseded this one.
      if (seq !== seqRef.current) return;

      // Filter out any null or undefined entries and ensure proper typing
      const validTimelines = (data || [])
        .filter((timeline): timeline is Timeline =>
          Boolean(timeline && timeline.id)
        )
        .map(timeline => {
          const row = {
            ...timeline,
            title: timeline.title || 'Name your timeline'
          };
          const floor = savedFloorRef.current.get(row.id);
          if (floor && toTime(floor) > toTime(row.updated_at)) {
            // This response predates a write we know landed. Trust the write.
            return { ...row, updated_at: floor };
          }
          // The server has caught up, so the floor has nothing left to say.
          // Self-cleaning like this is what keeps the map from growing.
          savedFloorRef.current.delete(row.id);
          return row;
        })
        // Redundant after the server's .order(), but it makes the client
        // comparator the single source of order — so if it can't read the
        // timestamp format, the initial list breaks visibly here rather than
        // silently in the realtime path. Also load-bearing now that the floor
        // above can move a row away from the position the server sent it in.
        .sort(byUpdatedAtDesc);

      setTimelines(validTimelines);
      setError(null);
    } catch (err) {
      console.error('Error loading timelines:', err);
      
      // If we haven't exceeded max retries and it's a network error, retry
      if (retryCount < MAX_RETRIES && err instanceof Error && err.message.includes('fetch')) {
        setTimeout(() => {
          loadTimelines(retryCount + 1);
        }, RETRY_DELAY * Math.pow(2, retryCount)); // Exponential backoff
        return;
      }

      setError('Failed to load timelines. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  /**
   * Re-sort the moment a save lands in this tab, without waiting on a round
   * trip — the signed-in counterpart of the guest path's DRAFTS_CHANGED_EVENT.
   *
   * This is what actually makes an edit move its tile. Realtime below is the
   * cross-tab bonus: `public.timelines` is in no `supabase_realtime`
   * publication in this repo, so where that hasn't been switched on by hand the
   * UPDATE branch never fires at all, and the list simply stopped reordering.
   *
   * Deliberately its own effect with empty deps, NOT folded into the
   * subscription below. That one re-runs on every `user` object identity
   * change, and AuthContext mints a fresh one on each TOKEN_REFRESHED — this
   * listener would be torn down and rebuilt roughly hourly, with a window in
   * which an echo lands on nothing. `setTimelines` and the refs are all stable,
   * so there is nothing here to keep current.
   *
   * No `user` gate either: signed out, `timelines` is empty and the merge finds
   * nothing to do.
   */
  useEffect(() => onTimelineSaved(({ id, updatedAt }) => {
    savedFloorRef.current.set(id, updatedAt);
    setTimelines(prev => {
      const current = prev.find(t => t.id === id);
      // Not in the list: a timeline created moments ago, or a fetch that hasn't
      // returned yet. Deliberately not inserted a stub — SidePanelBody already
      // synthesises a tile at index 0 for the open-but-missing timeline, using
      // the editor's live title, and a stub row would suppress that and render
      // "Name your timeline" over the top of it. The floor recorded above is
      // what makes the real row land correctly when it does arrive.
      if (!current) return prev;
      // Already at or ahead of this timestamp — realtime got here first, or the
      // same save is being echoed twice. Returning `prev` keeps it a true
      // no-op rather than a pointless re-render.
      if (toTime(current.updated_at) >= toTime(updatedAt)) return prev;
      return prev
        .map(t => (t.id === id ? { ...t, updated_at: updatedAt } : t))
        .sort(byUpdatedAtDesc);
    });
  }), []);

  useEffect(() => {
    // Initial load
    loadTimelines();

    if (!user) return;

    // Subscribe to realtime changes
    const channel = supabase
      .channel('timelines_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timelines',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // Handle different types of changes
          if (payload.eventType === 'INSERT') {
            const inserted = payload.new as Timeline;
            setTimelines(prev => {
              // Replace-if-present rather than prepending blindly: a
              // concurrent loadTimelines() may already have picked this row up
              // (very reachable — creating a timeline inserts while the
              // panel's open-refetch is in flight), and a duplicate here means
              // a duplicate React key and a doubled tile.
              const exists = prev.some(t => t.id === inserted.id);
              const next = exists
                ? prev.map(t => (t.id === inserted.id ? { ...t, ...inserted } : t))
                : [inserted, ...prev];
              return next.sort(byUpdatedAtDesc);
            });
          } else if (payload.eventType === 'DELETE') {
            setTimelines(prev => prev.filter(t => t.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            // Re-sort after merging, so an edit moves its tile immediately
            // instead of the list silently drifting out of order and snapping
            // on the next refetch. `.map()` already returned a fresh array, so
            // sorting it is safe — never sort `prev` itself.
            setTimelines(prev =>
              prev
                .map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t)
                .sort(byUpdatedAtDesc)
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Successfully subscribed
        } else if (status === 'CHANNEL_ERROR') {
          // Warn, don't `setError`. Since the save echo above took over live
          // re-sorting, a dead channel costs cross-tab updates and nothing
          // else — it is not a load failure. Setting `error` here put "Failed
          // to load timelines. Please try again." in front of any signed-in
          // user with no timelines yet, where the empty state belongs. It is
          // also the expected status whenever `timelines` isn't in the realtime
          // publication, which is the default state of this repo's schema.
          console.warn('Realtime unavailable for timelines; cross-tab updates are off');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTimelines, user]);

  return { timelines, isLoading, error, loadTimelines };
}