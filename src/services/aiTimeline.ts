import { supabase } from '../lib/supabase';
import { getActiveModel } from './userApiKey';
import {
  classifySubjectDirect,
  generateTimelineDirect,
  generateTimelineStreamDirect,
} from './anthropicDirect';
import {
  classifySubjectOpenAIDirect,
  generateTimelineOpenAIDirect,
  generateTimelineStreamOpenAIDirect,
} from './openaiDirect';
import {
  ProviderError,
  parseNdjsonStream,
  validateStreamChapter,
  validateStreamEvent,
  validateStreamMeta,
} from './llmShared';
import type { SubjectType, PillDefinition } from '../constants/pillDefinitions';
import type {
  ByokProvider,
  ClassificationResult,
  GeneratedTimeline,
  TimelineStreamHandlers,
} from '@/types/ai';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

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

// ---------------------------------------------------------------------------
// Streaming generation (NDJSON)
// ---------------------------------------------------------------------------

/**
 * Turn one NDJSON line into the handler call it stands for.
 *
 * Shared by all three routes so a line means the same thing however it
 * arrived. Validation is per line and never fatal: a malformed line is
 * dropped and the generation continues, because losing one event is a much
 * smaller failure than losing the timeline.
 *
 * `done` is deliberately NOT forwarded to `onDone` here. Each route signals
 * completion when its transport actually finishes, which is the only moment
 * that also covers a stream ending without ever emitting a `done` line.
 */
function dispatchLine(
  line: Record<string, unknown>,
  handlers: TimelineStreamHandlers,
): void {
  switch (line.type) {
    case 'meta': {
      const meta = validateStreamMeta(line);
      if (meta) handlers.onMeta(meta);
      break;
    }
    case 'chapter': {
      const chapter = validateStreamChapter(line);
      if (chapter) handlers.onChapter(chapter);
      break;
    }
    case 'event': {
      const event = validateStreamEvent(line);
      if (event) handlers.onEvent(event);
      break;
    }
    default:
      break;
  }
}

/**
 * Generate a timeline as a stream of NDJSON lines.
 *
 * The streaming counterpart to `generateTimeline` above, which stays for the
 * buffered path. Routes the same three ways and normalises all of them behind
 * one handler set, exactly as `enrichEvent` does for descriptions.
 *
 * Errors are reported through `handlers.onError` rather than thrown: there is
 * no single await for a caller to wrap once a stream is running, and a
 * failure half way through still leaves whatever arrived worth keeping.
 */
export async function streamTimeline(
  subject: string,
  subjectType: SubjectType | undefined,
  categories: PillDefinition[] | undefined,
  handlers: TimelineStreamHandlers,
  opts?: { signal?: AbortSignal; providerOverride?: ByokProvider },
): Promise<void> {
  const signal = opts?.signal;
  const onLine = (line: Record<string, unknown>) => dispatchLine(line, handlers);

  const categoryDefs =
    categories && categories.length > 0
      ? categories.map((c) => ({
          id: c.id,
          label: c.label,
          promptSnippet: c.promptSnippet,
        }))
      : undefined;

  const active = getActiveModel(opts?.providerOverride);
  if (active) {
    const { model, credential } = active;
    if (model.provider === 'openai') {
      await generateTimelineStreamOpenAIDirect(
        subject,
        categoryDefs,
        model,
        credential.key,
        handlers,
        onLine,
        signal,
      );
    } else {
      await generateTimelineStreamDirect(
        subject,
        categoryDefs,
        model,
        credential.key,
        handlers,
        onLine,
        signal,
      );
    }
    return;
  }

  // Server-funded route.
  //
  // `supabase.functions.invoke` buffers the whole response body, so it cannot
  // stream — which is why enrich-event is called with a raw fetch too. The
  // cost of dropping `invoke` is that it also attaches the session JWT for
  // us; here that has to be done by hand, and its absence handled rather than
  // sent as an anonymous request the function would reject with a 401.
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) {
    handlers.onError('Sign in or add your own API key to generate timelines.');
    return;
  }

  const body: Record<string, unknown> = { subject, stream: true };
  if (subjectType) body.subjectType = subjectType;
  if (categoryDefs) body.categories = categoryDefs;

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/generate-timeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    handlers.onError((err as Error).message || 'Network error');
    return;
  }

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const json = await res.json();
      if (json?.error) message = json.error;
    } catch {
      // A non-JSON body tells us nothing the status has not already.
    }
    handlers.onError(message);
    return;
  }

  try {
    await parseNdjsonStream(res.body, onLine);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    handlers.onError((err as Error).message || 'Stream interrupted');
    return;
  }

  handlers.onDone();
}
