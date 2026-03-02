import { useState } from 'react';
import { generateTimeline } from '../services/aiTimeline';
import { TimelineEvent } from '../types/event';

interface GenerateResult {
  title: string;
  description: string;
  events: TimelineEvent[];
}

export function useAIMode() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (subject: string): Promise<GenerateResult> => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateTimeline(subject);

      const events: TimelineEvent[] = result.events.map((e) => ({
        id: crypto.randomUUID(),
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        category: e.category,
      }));

      return {
        title: result.timelineTitle,
        description: result.timelineDescription,
        events,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  return { isGenerating, error, generate };
}
