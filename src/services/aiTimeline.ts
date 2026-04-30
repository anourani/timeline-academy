import { supabase } from '../lib/supabase';
import { getSessionToken } from './sessionToken';
import { getAnthropicKey } from './userApiKey';
import {
  classifySubjectDirect,
  generateTimelineDirect,
} from './anthropicDirect';
import { TimelineCategory } from '../types/event';
import type { SubjectType, PillDefinition } from '../constants/pillDefinitions';

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
 * Classify a subject into a type. Uses the cheapest/fastest model.
 *
 * Routes via the BYOK key when present, otherwise hits our edge function.
 */
export async function classifySubject(
  subject: string
): Promise<ClassificationResult> {
  const validTypes: SubjectType[] = ['person', 'event', 'topic', 'organization'];

  const byokKey = getAnthropicKey();
  if (byokKey) {
    const type = await classifySubjectDirect(subject, byokKey);
    return {
      type: validTypes.includes(type as SubjectType)
        ? (type as SubjectType)
        : 'topic',
    };
  }

  const { data, error } = await supabase.functions.invoke(
    'generate-timeline',
    {
      body: { subject, mode: 'classify' },
      headers: { 'x-session-token': getSessionToken() },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to classify subject');
  }

  const result = data as ClassificationResult | { error: string };

  if ('error' in result && typeof result.error === 'string') {
    throw new Error(result.error);
  }

  const classified = result as ClassificationResult;
  if (!validTypes.includes(classified.type)) {
    return { type: 'topic' };
  }
  return classified;
}

/**
 * Generate a full timeline via LLM.
 *
 * Routes via the BYOK key when present (browser-direct, no rate limit),
 * otherwise hits our edge function with the user's JWT or an anonymous
 * session token.
 */
export async function generateTimeline(
  subject: string,
  subjectType?: SubjectType,
  categories?: PillDefinition[]
): Promise<GeneratedTimeline> {
  const byokKey = getAnthropicKey();
  if (byokKey) {
    const categoryDefs =
      categories && categories.length > 0
        ? categories.map((c) => ({
            id: c.id,
            label: c.label,
            promptSnippet: c.promptSnippet,
          }))
        : undefined;
    return generateTimelineDirect(subject, categoryDefs, byokKey);
  }

  const body: Record<string, unknown> = { subject };
  if (subjectType) body.subjectType = subjectType;
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
    throw new Error(error.message || 'Failed to generate timeline');
  }

  const result = data as GeneratedTimeline | { error: string };
  if ('error' in result && typeof result.error === 'string') {
    throw new Error(result.error);
  }
  return result as GeneratedTimeline;
}
