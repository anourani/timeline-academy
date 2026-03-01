import { supabase } from '../lib/supabase';
import { getSessionToken } from './sessionToken';

export interface GeneratedTimeline {
  timelineTitle: string;
  timelineDescription: string;
  events: Array<{
    title: string;
    startDate: string;
    endDate: string;
    category: string;
  }>;
}

/**
 * Calls the Supabase Edge Function to generate a timeline via LLM.
 * Auth JWT is included automatically for logged-in users.
 * Session token is sent for anonymous rate limiting.
 */
export async function generateTimeline(
  subject: string
): Promise<GeneratedTimeline> {
  const { data, error } = await supabase.functions.invoke(
    'generate-timeline',
    {
      body: { subject },
      headers: { 'x-session-token': getSessionToken() },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to generate timeline');
  }

  // supabase.functions.invoke returns parsed JSON when Content-Type is application/json
  const result = data as GeneratedTimeline | { error: string };

  if ('error' in result && typeof result.error === 'string') {
    throw new Error(result.error);
  }

  return result as GeneratedTimeline;
}
