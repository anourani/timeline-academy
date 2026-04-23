import { supabase } from '../lib/supabase';
import { getSessionToken } from './sessionToken';
import { TimelineCategory } from '../types/event';
import type { SubjectType, PillDefinition } from '../constants/pillDefinitions';

// supabase.functions.invoke() surfaces non-2xx responses as a generic
// "Edge Function returned a non-2xx status code". The real payload is on
// the Response object at error.context — read it so we can display the
// server's {error: "..."} message instead of the generic string.
async function extractFunctionError(
  error: unknown,
  fallback: string
): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      // body wasn't JSON — fall through
    }
  }
  return (error as { message?: string } | null)?.message || fallback;
}

export interface GeneratedTimeline {
  timelineTitle: string;
  timelineDescription: string;
  categoryMapping?: Record<string, string>;
  events: Array<{
    title: string;
    startDate: string;
    endDate: string;
    category: TimelineCategory;
  }>;
}

export interface ClassificationResult {
  type: SubjectType;
}

/**
 * Calls the Supabase Edge Function to classify a subject into a type.
 * Uses the cheapest/fastest model for ~100ms response.
 */
export async function classifySubject(
  subject: string
): Promise<ClassificationResult> {
  const { data, error } = await supabase.functions.invoke(
    'generate-timeline',
    {
      body: { subject, mode: 'classify' },
      headers: { 'x-session-token': getSessionToken() },
    }
  );

  if (error) {
    throw new Error(await extractFunctionError(error, 'Failed to classify subject'));
  }

  const result = data as ClassificationResult | { error: string };

  if ('error' in result && typeof result.error === 'string') {
    throw new Error(result.error);
  }

  const validTypes: SubjectType[] = ['person', 'event', 'topic', 'organization'];
  const classified = result as ClassificationResult;

  // Fallback to topic if unexpected value
  if (!validTypes.includes(classified.type)) {
    return { type: 'topic' };
  }

  return classified;
}

/**
 * Calls the Supabase Edge Function to generate a timeline via LLM.
 * Auth JWT is included automatically for logged-in users.
 * Session token is sent for anonymous rate limiting.
 */
export async function generateTimeline(
  subject: string,
  subjectType?: SubjectType,
  categories?: PillDefinition[]
): Promise<GeneratedTimeline> {
  const body: Record<string, unknown> = { subject };

  if (subjectType) {
    body.subjectType = subjectType;
  }

  if (categories && categories.length > 0) {
    body.categories = categories.map((c) => ({
      id: c.id,
      label: c.label,
      promptSnippet: c.promptSnippet,
    }));
  }

  const { data, error } = await supabase.functions.invoke(
    'generate-timeline',
    {
      body,
      headers: { 'x-session-token': getSessionToken() },
    }
  );

  if (error) {
    throw new Error(await extractFunctionError(error, 'Failed to generate timeline'));
  }

  // supabase.functions.invoke returns parsed JSON when Content-Type is application/json
  const result = data as GeneratedTimeline | { error: string };

  if ('error' in result && typeof result.error === 'string') {
    throw new Error(result.error);
  }

  return result as GeneratedTimeline;
}
