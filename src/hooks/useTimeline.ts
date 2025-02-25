import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TimelineEvent, CategoryConfig } from '../types/event';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_TIMELINE_TITLE } from '../constants/defaults';

interface TimelineData {
  title: string;
  description?: string;
  events: TimelineEvent[];
  categories?: CategoryConfig[];
}

export function useTimeline() {
  const { user } = useAuth();
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTimelineId(null);
      setIsLoading(false);
      return;
    }

    const loadTimeline = async () => {
      try {
        const { data, error } = await supabase
          .from('timelines')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Error loading timeline:', error);
        }

        setTimelineId(data?.id ?? null);
      } catch (error) {
        console.error('Error loading timeline:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTimeline();
  }, [user]);

  const loadTimeline = async (id: string): Promise<TimelineData> => {
    if (!user) throw new Error('Must be signed in to load timeline');
    
    try {
      // Set the timelineId immediately for UI feedback
      setTimelineId(id === 'new' ? null : id);
      
      if (id === 'new') {
        // Check timeline limit before creating
        const { count, error: countError } = await supabase
          .from('timelines')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (countError) throw countError;
        
        if (count && count >= 3) {
          throw new Error('Maximum limit of 3 timelines reached');
        }

        // Create a new timeline
        const { data: newTimeline, error: createError } = await supabase
          .from('timelines')
          .insert({ title: DEFAULT_TIMELINE_TITLE, user_id: user.id })
          .select('id')
          .single();

        if (createError) throw createError;
        
        // Update the timelineId with the newly created timeline
        setTimelineId(newTimeline.id);
        
        return {
          title: DEFAULT_TIMELINE_TITLE,
          description: '',
          events: [],
          categories: undefined // Will use default categories
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

      // Also load timeline-specific categories if they exist
      const { data: categories, error: categoriesError } = await supabase
        .from('timeline_categories')
        .select('*')
        .eq('timeline_id', id);

      if (categoriesError && categoriesError.message !== 'relation "timeline_categories" does not exist') {
        throw categoriesError;
      }

      return {
        title: timeline.title,
        description: timeline.description || '',
        events: events.map(event => ({
          id: event.id,
          title: event.title,
          startDate: event.start_date,
          endDate: event.end_date,
          category: event.category
        })),
        categories: categories || undefined
      };
    } catch (error) {
      // Reset timelineId if there was an error
      setTimelineId(id === 'new' ? null : timelineId);
      throw error;
    }
  };

  const saveTimeline = async (title: string, events: TimelineEvent[], scale: 'large' | 'small' = 'large') => {
    if (!user) throw new Error('Must be signed in to save');

    try {
      if (!timelineId) {
        // Check timeline limit before saving
        const { count, error: countError } = await supabase
          .from('timelines')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (countError) throw countError;
        
        if (count && count >= 3) {
          throw new Error('Maximum limit of 3 timelines reached');
        }

        // Create new timeline
        const { data: timeline, error: timelineError } = await supabase
          .from('timelines')
          .insert({ title, user_id: user.id, scale })
          .select('id')
          .single();

        if (timelineError) throw timelineError;
        setTimelineId(timeline.id);

        // Insert events
        if (events.length > 0) {
          const { error: eventsError } = await supabase
            .from('events')
            .insert(
              events.map(event => ({
                timeline_id: timeline.id,
                title: event.title,
                start_date: event.startDate,
                end_date: event.endDate,
                category: event.category
              }))
            );

          if (eventsError) throw eventsError;
        }
      } else {
        // Update existing timeline
        const { error: timelineError } = await supabase
          .from('timelines')
          .update({ 
            title, 
            updated_at: new Date().toISOString(),
            scale 
          })
          .eq('id', timelineId);

        if (timelineError) throw timelineError;

        // Delete existing events and insert new ones
        const { error: deleteError } = await supabase
          .from('events')
          .delete()
          .eq('timeline_id', timelineId);

        if (deleteError) throw deleteError;

        if (events.length > 0) {
          const { error: eventsError } = await supabase
            .from('events')
            .insert(
              events.map(event => ({
                timeline_id: timelineId,
                title: event.title,
                start_date: event.startDate,
                end_date: event.endDate,
                category: event.category
              }))
            );

          if (eventsError) throw eventsError;
        }
      }
    } catch (error) {
      console.error('Error saving timeline:', error);
      throw error;
    }
  };

  return {
    timelineId,
    isLoading,
    saveTimeline,
    loadTimeline
  };
}