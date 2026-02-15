import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Timeline } from '../types/timeline';
import { useAuth } from '../contexts/AuthContext';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export function useTimelines() {
  const { user } = useAuth();
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTimelines = async (retryCount = 0) => {
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
        }));
      
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
  };

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
            setTimelines(prev => [payload.new as Timeline, ...prev]);
          } else if (payload.eventType === 'DELETE') {
            setTimelines(prev => prev.filter(t => t.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setTimelines(prev => 
              prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t)
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
  }, [user]);

  return { timelines, isLoading, error, loadTimelines };
}