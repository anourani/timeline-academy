import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Timeline } from '../Timeline/Timeline';
import { TimelineTitle } from '../TimelineTitle/TimelineTitle';
import { SCALES } from '../../constants/scales';
import { DEFAULT_CATEGORIES } from '../../constants/categories';
import { TimelineEvent, CategoryConfig } from '../../types/event';

interface TimelineData {
  title: string;
  description: string;
  events: TimelineEvent[];
  categories: CategoryConfig[];
  scale: 'large' | 'small';
}

export function TimelineViewer() {
  const { timelineId } = useParams();
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTimeline = async () => {
      if (!timelineId) {
        setError('No timeline ID provided');
        setLoading(false);
        return;
      }

      try {
        // First load the timeline
        const { data: timelineData, error: timelineError } = await supabase
          .from('timelines')
          .select('*')
          .eq('id', timelineId)
          .single();

        if (timelineError) {
          console.error('Error loading timeline:', timelineError);
          throw timelineError;
        }

        // Then load the events
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('*')
          .eq('timeline_id', timelineId);

        if (eventsError) {
          console.error('Error loading events:', eventsError);
          throw eventsError;
        }

        // Format events to match our TimelineEvent type
        const formattedEvents: TimelineEvent[] = eventsData.map(event => ({
          id: event.id,
          title: event.title,
          startDate: event.start_date,
          endDate: event.end_date || event.start_date,
          category: event.category
        }));

        // Ensure all categories have the visible property
        const categories = (timelineData.categories || DEFAULT_CATEGORIES).map(cat => ({
          ...cat,
          visible: true
        }));

        setTimeline({
          title: timelineData.title || 'Untitled Timeline',
          description: timelineData.description || '',
          events: formattedEvents,
          categories: categories,
          scale: timelineData.scale || 'large'
        });
      } catch (err) {
        console.error('Error loading timeline:', err);
        setError(err instanceof Error ? err.message : 'Failed to load timeline');
      } finally {
        setLoading(false);
      }
    };

    loadTimeline();
  }, [timelineId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-lg">Loading timeline...</div>
      </div>
    );
  }

  if (error || !timeline) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-lg text-red-400">
          {error || 'Timeline not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Minimal Header */}
      <div className="bg-black border-b border-gray-800">
        <div className="mx-auto px-8 py-2 flex justify-center items-center">
          <div className="text-2xl text-[#FBFBFB] font-['Droid_Serif'] leading-[1.15] pt-2">
            timeline.academy
          </div>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="pl-[32px] pr-8 pt-12 pb-8">
        <TimelineTitle 
          title={timeline.title}
          description={timeline.description}
          events={timeline.events}
        />
      </div>

      <main className="timeline-container relative mt-4">
        <Timeline 
          events={timeline.events}
          categories={timeline.categories}
          scale={SCALES[timeline.scale]}
        />
      </main>
    </div>
  );
}