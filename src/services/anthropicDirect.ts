// Browser-direct Anthropic client for BYOK ("Bring Your Own Key") mode.
// The user pastes their Anthropic API key into Settings; the browser then
// calls api.anthropic.com directly with their key — bypassing our edge
// functions, our rate limit, and our billing.
//
// Required header: anthropic-dangerous-direct-browser-access: true.
// Anthropic accepts this on browser-origin requests but warns against it for
// production server-side use. For BYOK that's exactly the trade-off we want.

import type {
  EnrichmentStreamHandlers,
  // re-export for callers via eventEnrichment.ts
} from './eventEnrichment'
import {
  getSystemPrompt,
  getUserPrompt,
  CLASSIFICATION_PROMPT,
  type CategoryDefinition,
} from './llmPrompts'
import type { EventSource, TimelineEvent } from '@/types/event'
import type { GeneratedTimeline } from './aiTimeline'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL_SONNET = 'claude-sonnet-4-6'
const MODEL_HAIKU = 'claude-haiku-4-5-20251001'

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

const ENRICH_SYSTEM_PROMPT = `You are writing a 1-2 paragraph description of a historical event for an educational timeline. Use the web_search tool to find authoritative sources before writing. Keep the description concise (max ~150 words for simple events, two short paragraphs for complex ones). Use a neutral encyclopedic tone. Do not include inline citations or footnotes — sources are listed separately. Do not invent facts that aren't in the search results.`

function buildEnrichUserPrompt(
  event: TimelineEvent,
  timelineTitle: string,
): string {
  const lines: string[] = []
  lines.push(`Write a description for this event: "${event.title}"`)
  if (event.startDate || event.endDate) {
    if (event.startDate && event.endDate && event.startDate !== event.endDate) {
      lines.push(`Date range: ${event.startDate} to ${event.endDate}`)
    } else if (event.startDate) {
      lines.push(`Date: ${event.startDate}`)
    }
  }
  if (timelineTitle) lines.push(`Timeline context: ${timelineTitle}`)
  lines.push(
    'Use the web_search tool to find sources, then write the description. Output only the description text — no headings, no source lists.',
  )
  return lines.join('\n')
}

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
        max_tokens: 1024,
        system: ENRICH_SYSTEM_PROMPT,
        tools: [
          {
            type: 'web_search_20250305',
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
    handlers.onError((err as Error).message || 'Network error')
    return
  }

  if (!res.ok || !res.body) {
    let message = `Anthropic API error (${res.status})`
    try {
      const body = await res.text()
      // Most Anthropic errors include a useful `.error.message`.
      try {
        const parsed = JSON.parse(body) as {
          error?: { message?: string; type?: string }
        }
        if (parsed?.error?.message) message = parsed.error.message
      } catch {
        if (body) message = body.slice(0, 200)
      }
    } catch {
      // ignore
    }
    handlers.onError(message)
    return
  }

  const sources: EventSource[] = []
  const seenUrls = new Set<string>()
  const blockTypes = new Map<number, string>()

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const lines = rawEvent.split('\n')
        let eventName = ''
        let dataStr = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) eventName = line.slice(7).trim()
          else if (line.startsWith('data: ')) dataStr += line.slice(6)
        }
        if (!dataStr) continue
        let data: Record<string, unknown>
        try {
          data = JSON.parse(dataStr)
        } catch {
          continue
        }

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
      }
    }

    handlers.onSources(sources)
    handlers.onDone()
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message || 'Stream interrupted')
  }
}

// ---------------------------------------------------------------------------
// Timeline generation (non-streaming JSON)
// ---------------------------------------------------------------------------

function stripCodeFence(text: string): string {
  const t = text.trim()
  if (!t.startsWith('```')) return t
  return t.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
}

function parseTimelineJson(text: string): GeneratedTimeline {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(text))
  } catch {
    throw new Error('LLM returned invalid JSON')
  }

  const obj = parsed as Record<string, unknown>
  if (typeof obj.timelineTitle !== 'string' || !obj.timelineTitle) {
    throw new Error('Missing timelineTitle in LLM response')
  }
  if (typeof obj.timelineDescription !== 'string') {
    throw new Error('Missing timelineDescription in LLM response')
  }
  if (!Array.isArray(obj.events) || obj.events.length === 0) {
    throw new Error('Missing or empty events array in LLM response')
  }

  const validCategories = new Set([
    'category_1',
    'category_2',
    'category_3',
    'category_4',
  ])

  const events = (obj.events as Array<Record<string, unknown>>)
    .filter(
      (e) =>
        typeof e.category === 'string' && validCategories.has(e.category),
    )
    .map((e, i) => {
      if (typeof e.title !== 'string' || !e.title) {
        throw new Error(`Event ${i}: missing title`)
      }
      if (typeof e.startDate !== 'string' || !e.startDate) {
        throw new Error(`Event ${i}: missing startDate`)
      }
      if (typeof e.endDate !== 'string' || !e.endDate) {
        throw new Error(`Event ${i}: missing endDate`)
      }
      return {
        title: (e.title as string).slice(0, 55),
        startDate: e.startDate as string,
        endDate: e.endDate as string,
        category: e.category as
          | 'category_1'
          | 'category_2'
          | 'category_3'
          | 'category_4',
      }
    })

  if (events.length === 0) {
    throw new Error('No valid events in LLM response')
  }

  let categoryMapping: Record<string, string> | undefined
  if (
    obj.categoryMapping &&
    typeof obj.categoryMapping === 'object' &&
    !Array.isArray(obj.categoryMapping)
  ) {
    categoryMapping = obj.categoryMapping as Record<string, string>
  }

  return {
    timelineTitle: obj.timelineTitle as string,
    timelineDescription: obj.timelineDescription as string,
    categoryMapping,
    events,
  }
}

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
      temperature: 0.4,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = `Anthropic API error (${res.status})`
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } }
      if (parsed?.error?.message) message = parsed.error.message
    } catch {
      if (body) message = body.slice(0, 200)
    }
    throw new Error(message)
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
    const body = await res.text().catch(() => '')
    let message = `Anthropic API error (${res.status})`
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } }
      if (parsed?.error?.message) message = parsed.error.message
    } catch {
      if (body) message = body.slice(0, 200)
    }
    throw new Error(message)
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
