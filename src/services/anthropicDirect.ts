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
import { parseTimelineJson, readApiError, readSseStream } from './llmShared'
import type { EnrichmentStreamHandlers, GeneratedTimeline } from '@/types/ai'
import type { EventSource, TimelineEvent } from '@/types/event'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// Deliberately mid-tier, not frontier. This workload is bounded JSON
// generation and short prose — Opus- and Fable-tier models cost several times
// as much for no gain the user can see, and BYOK spend lands on the user's own
// account. Do not "upgrade" these to a frontier model without a reason.
//
// Model IDs are complete as written; do not append date suffixes.
const MODEL_SONNET = 'claude-sonnet-5'
const MODEL_HAIKU = 'claude-haiku-4-5'

function headers(key: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

// ---------------------------------------------------------------------------
// Event enrichment (streaming)
// ---------------------------------------------------------------------------

export async function enrichEventDirect(
  event: TimelineEvent,
  timelineTitle: string,
  handlers: EnrichmentStreamHandlers,
  apiKey: string,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({
        model: MODEL_SONNET,
        // Sonnet 5 runs adaptive thinking by default, and max_tokens caps
        // thinking PLUS response text. The old 1024 was sized for the
        // description alone and would now truncate mid-sentence.
        //
        // We leave thinking on rather than disabling it to claw the budget
        // back: with thinking off, Sonnet 5 reaches for tools noticeably less
        // often, and this call is only worth making if web_search actually
        // fires — a description with an empty Sources list is the failure
        // mode nothing else here would catch. max_tokens is a ceiling, not a
        // charge; only tokens actually produced are billed.
        max_tokens: 4096,
        system: ENRICH_SYSTEM_PROMPT,
        tools: [
          {
            // Dynamic filtering: results are filtered before they reach the
            // context window. Enrichment cost is dominated by search-result
            // input tokens, so this is the cheapest lever available here.
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 3,
          },
        ],
        messages: [
          { role: 'user', content: buildEnrichUserPrompt(event, timelineTitle) },
        ],
        stream: true,
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
      await readApiError(res, 'Anthropic API error', MODEL_SONNET),
      'anthropic',
    )
    return
  }

  const sources: EventSource[] = []
  const seenUrls = new Set<string>()
  const blockTypes = new Map<number, string>()

  try {
    await readSseStream(res.body, (eventName, data) => {
      if (eventName === 'content_block_start') {
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
  apiKey: string,
): Promise<GeneratedTimeline> {
  const userPrompt = categories
    ? getUserPrompt(subject, categories)
    : `Generate a biographical timeline for: ${subject}`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model: MODEL_SONNET,
      max_tokens: 4096,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: userPrompt }],
      // No `temperature`: Sonnet 5 rejects a non-default value with a 400.
      // The old 0.4 is gone rather than moved — steer with the prompt.
      //
      // Thinking is off because this call emits a fixed JSON schema and uses
      // no tools, so there is nothing for reasoning to improve, and adaptive
      // thinking would eat into the same max_tokens the JSON needs. (The
      // enrichment call above makes the opposite trade for the opposite
      // reason — it depends on a tool firing.)
      thinking: { type: 'disabled' },
    }),
  })

  if (!res.ok) {
    throw new Error(await readApiError(res, 'Anthropic API error', MODEL_SONNET))
  }

  const json = await res.json()
  const block = json.content?.[0]
  if (!block || block.type !== 'text') {
    throw new Error('Empty response from Anthropic')
  }

  return parseTimelineJson(block.text as string)
}

// ---------------------------------------------------------------------------
// Subject classification (cheap, non-streaming)
// ---------------------------------------------------------------------------

export async function classifySubjectDirect(
  subject: string,
  apiKey: string,
): Promise<string> {
  const validTypes = new Set(['person', 'event', 'topic', 'organization'])

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      model: MODEL_HAIKU,
      max_tokens: 32,
      messages: [
        {
          role: 'user',
          content: CLASSIFICATION_PROMPT.replace('{subject}', subject),
        },
        { role: 'assistant', content: '{"type": "' },
      ],
      temperature: 0,
    }),
  })

  if (!res.ok) {
    throw new Error(await readApiError(res, 'Anthropic API error', MODEL_HAIKU))
  }

  const json = await res.json()
  const block = json.content?.[0]
  if (!block || block.type !== 'text') {
    throw new Error('Empty response from Anthropic')
  }

  // We prefilled with '{"type": "' so the response continues from there.
  const text = '{"type": "' + (block.text as string)
  let parsed: { type: string }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('LLM returned invalid JSON for classification')
  }

  return validTypes.has(parsed.type) ? parsed.type : 'topic'
}
