// Browser-direct Anthropic client for BYOK ("Bring Your Own Key") mode.
// The user pastes their Anthropic API key into Settings; the browser then
// calls api.anthropic.com directly with their key — bypassing our edge
// functions, our rate limit, and our billing.
//
// Required header: anthropic-dangerous-direct-browser-access: true.
// Anthropic accepts this on browser-origin requests but warns against it for
// production server-side use. For BYOK that's exactly the trade-off we want.
// OpenAI publishes no equivalent opt-in — see openaiDirect.ts.

import {
  getSystemPrompt,
  getUserPrompt,
  buildEnrichUserPrompt,
  CLASSIFICATION_PROMPT,
  ENRICH_SYSTEM_PROMPT,
  type CategoryDefinition,
} from './llmPrompts'
import {
  parseTimelineJson,
  readApiError,
  readSseStream,
  stripCodeFence,
} from './llmShared'
import type { ModelDef } from '@/constants/models'
import type { EnrichmentStreamHandlers, GeneratedTimeline } from '@/types/ai'
import type { EventSource, TimelineEvent } from '@/types/event'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// No model constants here. Every call takes the ModelDef the user chose and
// spreads its per-call params into the body, so this file has no per-model
// branches and a pin rotation is a registry edit. The reasoning that used to
// live above the Sonnet pin — why the default is mid-tier rather than
// frontier — moved to src/constants/models.ts with it.

function headers(key: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

/**
 * The text of a non-streaming response, or a thrown error explaining why
 * there isn't any.
 *
 * Two things this must not do, both of which the old `content[0]` read did:
 *
 *  - Take the first block. Every model in the registry thinks by default, so
 *    `content[0]` is a `thinking` block and the JSON sits behind it. Reading
 *    index 0 would fail on Opus and Fable every single time.
 *  - Read `content` before `stop_reason`. Opus 5 and Fable 5.1 can decline a
 *    request with HTTP 200 and `stop_reason: 'refusal'`, which would
 *    otherwise surface as a bare "Empty response".
 */
function readMessageText(json: Record<string, unknown>): string {
  if (json.stop_reason === 'refusal') {
    throw new Error(
      'The model declined this request. Try rephrasing the subject, or pick a different model.',
    )
  }

  // Checked before the emptiness test below, because running out of room is
  // the more useful thing to say in both cases it produces: a truncated reply
  // (which would otherwise read as invalid JSON) and a reply that spent the
  // whole budget thinking (which would otherwise read as an empty response).
  // The cap covers thinking as well as the answer.
  if (json.stop_reason === 'max_tokens') {
    throw new Error(
      'The model ran out of room before finishing. Try again, or pick a different model.',
    )
  }

  const blocks = (json.content as Array<Record<string, unknown>> | undefined) ?? []
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text as string)
    .join('')

  if (!text) throw new Error('Empty response from Anthropic')

  return text
}

// ---------------------------------------------------------------------------
// Event enrichment (streaming)
// ---------------------------------------------------------------------------

export async function enrichEventDirect(
  event: TimelineEvent,
  timelineTitle: string,
  handlers: EnrichmentStreamHandlers,
  model: ModelDef,
  apiKey: string,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({
        model: model.id,
        system: ENRICH_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: buildEnrichUserPrompt(event, timelineTitle) },
        ],
        stream: true,
        // max_tokens and the web_search tool come from the registry: every
        // model here thinks, and the cap covers thinking PLUS the description,
        // so the ceiling is per-model. Thinking is deliberately left on for
        // this call — with it off the model reaches for tools noticeably less
        // often, and an enrichment whose search never fires produces an empty
        // Sources list with no error anywhere.
        ...model.params.enrich,
      }),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message || 'Network error', 'anthropic')
    return
  }

  if (!res.ok || !res.body) {
    handlers.onError(
      await readApiError(res, 'Anthropic API error', model.id, 'anthropic'),
      'anthropic',
    )
    return
  }

  const sources: EventSource[] = []
  const seenUrls = new Set<string>()
  const blockTypes = new Map<number, string>()
  // A refusal arrives mid-stream with HTTP 200 and no text blocks, so without
  // this the panel would simply settle on an empty description.
  let refused = false

  try {
    await readSseStream(res.body, (eventName, data) => {
      if (eventName === 'message_delta') {
        const delta = data.delta as Record<string, unknown> | undefined
        if (delta?.stop_reason === 'refusal') refused = true
      } else if (eventName === 'content_block_start') {
        const index = data.index as number
        const block = data.content_block as Record<string, unknown>
        if (block && typeof block.type === 'string') {
          blockTypes.set(index, block.type)
        }
        if (block?.type === 'web_search_tool_result') {
          const content = block.content as Array<Record<string, unknown>> | undefined
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'web_search_result') {
                const url = item.url as string | undefined
                const title = (item.title as string | undefined) ?? ''
                if (url && !seenUrls.has(url)) {
                  seenUrls.add(url)
                  sources.push({ title: title || url, url })
                }
              }
            }
          }
        }
      } else if (eventName === 'content_block_delta') {
        const index = data.index as number
        const delta = data.delta as Record<string, unknown>
        const blockType = blockTypes.get(index)
        if (blockType === 'text' && delta?.type === 'text_delta') {
          const text = delta.text as string
          if (text) handlers.onDelta(text)
        }
      }
    })

    if (refused) {
      handlers.onError(
        'The model declined to describe this event. Try a different model.',
        'anthropic',
      )
      return
    }

    handlers.onSources(sources)
    handlers.onDone()
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message || 'Stream interrupted', 'anthropic')
  }
}

// ---------------------------------------------------------------------------
// Timeline generation (non-streaming JSON)
// ---------------------------------------------------------------------------

export async function generateTimelineDirect(
  subject: string,
  categories: CategoryDefinition[] | undefined,
  model: ModelDef,
  apiKey: string,
): Promise<GeneratedTimeline> {
  const userPrompt = categories
    ? getUserPrompt(subject, categories)
    : `Generate a biographical timeline for: ${subject}`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model: model.id,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: userPrompt }],
      // No `temperature`: every model in the registry rejects a non-default
      // value with a 400. The old 0.4 is gone rather than moved — steer with
      // the prompt.
      //
      // How thinking is handled is per-model and lives in the registry: Sonnet
      // takes `thinking: { type: 'disabled' }` because this call emits a fixed
      // JSON schema with no tools, while Opus and Fable must leave it alone
      // (Fable 400s on any explicit value, and Opus can leak <thinking> tags
      // into the text with it off) and lower `effort` instead.
      ...model.params.generate,
    }),
  })

  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'Anthropic API error', model.id, 'anthropic'),
    )
  }

  return parseTimelineJson(readMessageText(await res.json()))
}

// ---------------------------------------------------------------------------
// Subject classification (non-streaming)
// ---------------------------------------------------------------------------

/**
 * Classify a subject into one of four types.
 *
 * This used to run on Haiku with an assistant prefill (`{"type": "` as the
 * start of the reply) and `temperature: 0`. Both are 400s on every model the
 * dropdown offers, so both are gone — and their job is done better by
 * `output_config.format`, which the registry puts in `params.classify`: the
 * reply is constrained to the schema rather than merely started in the right
 * shape. The parse below therefore matches the OpenAI twin's: read the whole
 * reply, validate against the four types, fall back to `topic`.
 */
export async function classifySubjectDirect(
  subject: string,
  model: ModelDef,
  apiKey: string,
): Promise<string> {
  const validTypes = new Set(['person', 'event', 'topic', 'organization'])

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model: model.id,
      messages: [
        {
          role: 'user',
          content: CLASSIFICATION_PROMPT.replace('{subject}', subject),
        },
      ],
      ...model.params.classify,
    }),
  })

  if (!res.ok) {
    throw new Error(
      await readApiError(res, 'Anthropic API error', model.id, 'anthropic'),
    )
  }

  // readMessageText outside the try: a refusal or a truncated reply has its
  // own message worth showing, and folding it into the parse failure below
  // would replace it with a misleading one.
  const text = readMessageText(await res.json())

  let parsed: { type: string }
  try {
    parsed = JSON.parse(stripCodeFence(text))
  } catch {
    throw new Error('LLM returned invalid JSON for classification')
  }

  return validTypes.has(parsed.type) ? parsed.type : 'topic'
}
