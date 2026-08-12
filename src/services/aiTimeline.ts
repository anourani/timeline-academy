import { supabase } from '../lib/supabase';
import { getActiveCredential, getCredentialFor } from './userApiKey';
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
  ByokCredential,
  ByokProvider,
  ClassificationResult,
  GeneratedTimeline,
} from '@/types/ai';

/**
 * Which BYOK credential this call should use, or null for the server path.
 *
 * `override` exists for the retry-with-the-other-provider action: it targets
 * one provider for a single call without touching the stored default, so a
 * one-off retry never silently redefines which provider the user is on.
 */
function resolveCredential(
  override?: ByokProvider
): ByokCredential | null {
  return override ? getCredentialFor(override) : getActiveCredential();
}

// Moved to @/types/ai so llmShared.ts can reference GeneratedTimeline without
// importing this module (which imports the direct clients, which import
// llmShared). Re-exported so existing importers keep working.
export type { ClassificationResult, GeneratedTimeline } from '@/types/ai';

/**
 * Classify a subject into a type. Uses the cheapest/fastest model.
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

  const credential = resolveCredential(providerOverride);
  if (credential) {
    let type: string;
    try {
      type =
        credential.provider === 'openai'
          ? await classifySubjectOpenAIDirect(subject, credential.key)
          : await classifySubjectDirect(subject, credential.key);
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
  const credential = resolveCredential(providerOverride);
  if (credential) {
    const categoryDefs =
      categories && categories.length > 0
        ? categories.map((c) => ({
            id: c.id,
            label: c.label,
            promptSnippet: c.promptSnippet,
          }))
        : undefined;
    try {
      return credential.provider === 'openai'
        ? await generateTimelineOpenAIDirect(
            subject,
            categoryDefs,
            credential.key
          )
        : await generateTimelineDirect(subject, categoryDefs, credential.key);
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
