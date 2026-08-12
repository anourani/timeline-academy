// Browser-direct OpenAI client for BYOK ("Bring Your Own Key") mode.
//
// Mirrors anthropicDirect.ts in shape, with three deliberate differences:
//
//  1. No browser-access opt-in header. Anthropic requires
//     `anthropic-dangerous-direct-browser-access`; OpenAI publishes no
//     equivalent. Whether api.openai.com accepts browser-origin requests at
//     all is a property of their CORS policy, not something we can assert
//     from here — see the PRD for the verification this rests on.
//  2. Generation and classification use /v1/chat/completions with
//     `response_format: json_object`, which is what makes the prose-only
//     "JSON ONLY" instruction in llmPrompts.ts reliable. Only enrichment
//     needs /v1/responses, because that is where web search lives.
//  3. No assistant prefill. Anthropic's classify call starts the reply with
//     `{"type": "` to force shape; OpenAI has no equivalent, and structured
//     output replaces it.

import {
  getSystemPrompt,
  getUserPrompt,
  buildEnrichUserPrompt,
  CLASSIFICATION_PROMPT,
  ENRICH_SYSTEM_PROMPT,
  type CategoryDefinition,
} from './llmPrompts'
import { parseTimelineJson, readApiError, readSseStream } from './llmShared'
import type { EnrichmentStreamHandlers, GeneratedTimeline } from '@/types/ai'
import type { EventSource, TimelineEvent } from '@/types/event'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

// Deliberately mid-tier and budget-tier, not frontier — same reasoning as the
// Anthropic pins: this workload is bounded JSON and short prose, and BYOK
// spend lands on the user's own account.
const MODEL_MAIN = 'gpt-5.6-terra'
const MODEL_CHEAP = 'gpt-5.6-luna'

function headers(key: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  }
}

// ---------------------------------------------------------------------------
// Event enrichment (streaming, Responses API + web search)
// ---------------------------------------------------------------------------

/**
 * Pull url_citation annotations out of the terminal `response.completed`
 * payload.
 *
 * This is the authoritative source for the Sources list, not the streamed
 * annotation events. Those arrive earlier and are a latency win, but the
 * streamed event name has been renamed at least once in OpenAI SDK history —
 * and if the list depended on it alone, a rename would produce an empty
 * Sources section with no error anywhere: the description would still stream,
 * the panel would still say loaded, and the only symptom would be missing
 * links nobody notices.
 */
function harvestCompletedCitations(
  data: Record<string, unknown>,
  add: (url: string, title?: string) => void,
): void {
  const response = data.response as Record<string, unknown> | undefined
  const output = response?.output as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(output)) return

  for (const item of output) {
    if (item.type !== 'message') continue
    const content = item.content as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part.type !== 'output_text') continue
      const annotations = part.annotations as
        | Array<Record<string, unknown>>
        | undefined
      if (!Array.isArray(annotations)) continue
      for (const a of annotations) {
        if (a.type === 'url_citation' && typeof a.url === 'string') {
          add(a.url, typeof a.title === 'string' ? a.title : undefined)
        }
      }
    }
  }
}

export async function enrichEventOpenAIDirect(
  event: TimelineEvent,
  timelineTitle: string,
  handlers: EnrichmentStreamHandlers,
  apiKey: string,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({
        model: MODEL_MAIN,
        // `instructions` is the Responses-API analogue of Anthropic's
        // top-level `system`.
        instructions: ENRICH_SYSTEM_PROMPT,
        input: buildEnrichUserPrompt(event, timelineTitle),
        tools: [{ type: 'web_search' }],
        include: ['web_search_call.action.sources'],
        // A ceiling, not a charge. Generous because reasoning-capable models
        // spend part of the budget before the visible answer starts.
        max_output_tokens: 4096,
        // NOT cosmetic: the Responses API defaults to store: true, which
        // persists the user's prompts and our outputs into THEIR OpenAI
        // dashboard. The Anthropic path has no equivalent, and the privacy
        // policy describes neither. Leave this false.
        store: false,
        stream: true,
      }),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message || 'Network error', 'openai')
    return
  }

  if (!res.ok || !res.body) {
    handlers.onError(
      await readApiError(res, 'OpenAI API error', MODEL_MAIN),
      'openai',
    )
    return
  }

  const sources: EventSource[] = []
  const seenUrls = new Set<string>()
  const addSource = (url: string, title?: string) => {
    if (!url || seenUrls.has(url)) return
    seenUrls.add(url)
    sources.push({ title: title || url, url })
  }

  let failure: string | null = null

  try {
    await readSseStream(res.body, (eventName, data) => {
      switch (eventName) {
        case 'response.output_text.delta': {
          const text = data.delta as string | undefined
          if (text) handlers.onDelta(text)
          break
        }
        case 'response.output_text.annotation.added': {
          const annotation = data.annotation as
            | Record<string, unknown>
            | undefined
          if (annotation?.type === 'url_citation') {
            const url = annotation.url as string | undefined
            const title = annotation.title as string | undefined
            if (url) addSource(url, title)
          }
          break
        }
        case 'response.completed':
          harvestCompletedCitations(data, addSource)
          break
        case 'response.failed':
        case 'response.incomplete': {
          const response = data.response as Record<string, unknown> | undefined
          const error = response?.error as Record<string, unknown> | undefined
          failure = (error?.message as string) || 'Generation failed'
          break
        }
        case 'error':
          failure = (data.message as string) || 'Generation failed'
          break
        default:
          // Every other event is progress noise we don't render
          // (response.created, response.web_search_call.*, content_part.*,
          // reasoning summaries). Deliberately ignored rather than logged —
          // but if the Sources list ever comes back empty, log here first:
          // an unhandled or renamed event is the likeliest cause.
          break
      }
    })

    if (failure) {
      handlers.onError(failure, 'openai')
      return
    }

    handlers.onSources(sources)
    handlers.onDone()
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message || 'Stream interrupted', 'openai')
  }
}

// ---------------------------------------------------------------------------
// Timeline generation (non-streaming JSON)
// ---------------------------------------------------------------------------

export async function generateTimelineOpenAIDirect(
  subject: string,
  categories: CategoryDefinition[] | undefined,
  apiKey: string,
): Promise<GeneratedTimeline> {
  const userPrompt = categories
    ? getUserPrompt(subject, categories)
    : `Generate a biographical timeline for: ${subject}`

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model: MODEL_MAIN,
      // `json_object` requires the literal word "JSON" somewhere in the
      // messages. getSystemPrompt() satisfies that incidentally ("JSON ONLY",
      // "RESPONSE SCHEMA"); a future prompt edit that removes the word would
      // 400 every OpenAI generation while the Anthropic path kept working.
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: userPrompt },
      ],
      // No `temperature`: newer reasoning-capable models reject non-default
      // sampling parameters, and this is a schema-constrained emit anyway.
      max_tokens: 8192,
    }),
  })

  if (!res.ok) {
    throw new Error(await readApiError(res, 'OpenAI API error', MODEL_MAIN))
  }

  const json = await res.json()
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from OpenAI')

  return parseTimelineJson(text as string)
}

// ---------------------------------------------------------------------------
// Subject classification (cheap, non-streaming)
// ---------------------------------------------------------------------------

export async function classifySubjectOpenAIDirect(
  subject: string,
  apiKey: string,
): Promise<string> {
  const validTypes = new Set(['person', 'event', 'topic', 'organization'])

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model: MODEL_CHEAP,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: CLASSIFICATION_PROMPT.replace('{subject}', subject),
        },
      ],
      // Anthropic's version caps this at 32 because an assistant prefill has
      // already written most of the answer. There is no prefill here, and a
      // reasoning-capable model may spend tokens before emitting, so the
      // ceiling is looser. Still fractions of a cent on the budget tier.
      max_tokens: 256,
    }),
  })

  if (!res.ok) {
    throw new Error(await readApiError(res, 'OpenAI API error', MODEL_CHEAP))
  }

  const json = await res.json()
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from OpenAI')

  let parsed: { type: string }
  try {
    parsed = JSON.parse(text as string)
  } catch {
    throw new Error('LLM returned invalid JSON for classification')
  }

  return validTypes.has(parsed.type) ? parsed.type : 'topic'
}
