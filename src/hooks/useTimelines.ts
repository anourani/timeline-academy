import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Timeline } from '../types/timeline';
import { useAuth } from './useAuth';

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
 * If you ever see the edited timeline sink instead of rise, that is Date.parse
 * returning NaN on the realtime format — start here.
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

  const loadTimelines = useCallback(async (retryCount = 0) => {
    if (!user) {
      setTimelines([]);
      setIsLoading(false);
      setError(null);
      return;
    }

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
      
      // Filter out any null or undefined entries and ensure proper typing
      const validTimelines = (data || [])
        .filter((timeline): timeline is Timeline => 
          Boolean(timeline && timeline.id)
        )
        .map(timeline => ({
          ...timeline,
          title: timeline.title || 'Name your timeline'
        }))
        // Redundant after the server's .order(), but it makes the client
        // comparator the single source of order — so if it can't read the
        // timestamp format, the initial list breaks visibly here rather than
        // silently in the realtime path.
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
          console.error('Error subscribing to timeline changes');
          setError('Failed to subscribe to timeline updates');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTimelines, user]);

  return { timelines, isLoading, error, loadTimelines };
}