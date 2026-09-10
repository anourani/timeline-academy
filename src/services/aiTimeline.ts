import { supabase } from '../lib/supabase';
import { getActiveModel } from './userApiKey';
import {
  classifySubjectDirect,
  generateTimelineDirect,
} from './anthropicDirect';
import {
  classifySubjectOpenAIDirect,
  generateTimelineOpenAIDirect,
} from './openaiDirect';
import { ProviderError } from './llmShared';
import type { SubjectType, PillDefinition } from '../constants/pillDefinitions';
import type {
  ByokProvider,
  ClassificationResult,
  GeneratedTimeline,
} from '@/types/ai';

// `getActiveModel()` resolves the model AND the key that pays for it, in one
// call. That is the whole of "the chosen model answers every BYOK call": the
// two functions below and enrichEvent() ask the same resolver, so classifying
// a subject, generating the timeline and writing an event's description all
// land on the model the user picked and the one account they picked it for.
//
// `providerOverride` is the retry-with-the-other-provider action. It targets
// that provider's default model for a single call and leaves the stored
// preference alone, so a one-off retry never silently redefines what the user
// is on.

// Moved to @/types/ai so llmShared.ts can reference GeneratedTimeline without
// importing this module (which imports the direct clients, which import
// llmShared). Re-exported so existing importers keep working.
export type { ClassificationResult, GeneratedTimeline } from '@/types/ai';

/**
 * Classify a subject into a type.
 *
 * On BYOK this runs on whichever model the user chose, like every other AI
 * call. The server-funded path still uses Haiku, pinned in the Edge Function.
 *
 * Routes via the BYOK key when present, otherwise hits our edge function
 * (which requires a signed-in user — supabase.functions.invoke attaches the
 * session JWT automatically).
 */
export async function classifySubject(
  subject: string,
  providerOverride?: ByokProvider
): Promise<ClassificationResult> {
  const validTypes: SubjectType[] = ['person', 'event', 'topic', 'organization'];

  const active = getActiveModel(providerOverride);
  if (active) {
    const { model, credential } = active;
    let type: string;
    try {
      type =
        model.provider === 'openai'
          ? await classifySubjectOpenAIDirect(subject, model, credential.key)
          : await classifySubjectDirect(subject, model, credential.key);
    } catch (err) {
      // Wrapped here rather than inside each client so there is one wrap site
      // per call, and so the UI knows which provider to offer a retry against.
      throw new ProviderError((err as Error).message, credential.provider);
    }
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
 * otherwise hits our edge function with the user's JWT. Logged-out users
 * without a key are gated to sign-in-or-BYOK before this is called.
 */
export async function generateTimeline(
  subject: string,
  subjectType?: SubjectType,
  categories?: PillDefinition[],
  providerOverride?: ByokProvider
): Promise<GeneratedTimeline> {
  const active = getActiveModel(providerOverride);
  if (active) {
    const { model, credential } = active;
    const categoryDefs =
      categories && categories.length > 0
        ? categories.map((c) => ({
            id: c.id,
            label: c.label,
            promptSnippet: c.promptSnippet,
          }))
        : undefined;
    try {
      return model.provider === 'openai'
        ? await generateTimelineOpenAIDirect(
            subject,
            categoryDefs,
            model,
            credential.key
          )
        : await generateTimelineDirect(
            subject,
            categoryDefs,
            model,
            credential.key
          );
    } catch (err) {
      throw new ProviderError((err as Error).message, credential.provider);
    }
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
