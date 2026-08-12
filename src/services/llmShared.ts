// Provider-neutral helpers shared by anthropicDirect.ts and openaiDirect.ts.
//
// This module must not import either direct client — it sits below both.
//
// `parseTimelineJson` is a near-duplicate of `parseAndValidate` in
// supabase/functions/_shared/llm-client.ts. The two runtimes cannot share a
// module, so the duplication is deliberate; keep them behaviourally identical,
// the same convention llmPrompts.ts follows for the prompt text.

import type { ByokProvider, GeneratedTimeline } from '@/types/ai'

/** An error that knows which BYOK provider produced it, so the UI can offer
 *  a retry against the other one. */
export class ProviderError extends Error {
  provider: ByokProvider

  constructor(message: string, provider: ByokProvider) {
    super(message)
    this.name = 'ProviderError'
    this.provider = provider
  }
}

/**
 * Turn a non-OK provider response into a message worth showing a user.
 *
 * Both providers wrap errors in `{ error: { message } }`, so one reader covers
 * them. Pass `model` to get a specific message for the access failures that
 * look like app bugs otherwise: both providers gate models by account tier and
 * spend history, so a brand-new key with no billing set up gets a 403/404 that
 * would otherwise surface as a bare "API error (404)".
 */
export async function readApiError(
  res: Response,
  label: string,
  model?: string,
): Promise<string> {
  let message = `${label} (${res.status})`
  try {
    const body = await res.text()
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } }
      if (parsed?.error?.message) message = parsed.error.message
    } catch {
      if (body) message = body.slice(0, 200)
    }
  } catch {
    // ignore — we still have the status-code fallback
  }

  if (model && (res.status === 403 || res.status === 404)) {
    return `Your API key can't reach ${model}. The account may need billing set up, or may not have access to that model yet.`
  }
  return message
}

/**
 * Read an SSE body and hand each complete frame to `onEvent`.
 *
 * Frames are separated by a blank line; `event:` names the frame and `data:`
 * carries the JSON payload (repeated `data:` lines are concatenated).
 * Un-parseable frames are skipped rather than thrown, because a single
 * malformed frame should not abort a stream that is otherwise fine.
 *
 * Abort handling stays with the caller — an aborted read rejects here and the
 * caller decides whether that is a user action or a real failure.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (name: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

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
      onEvent(eventName, data)
    }
  }
}

export function stripCodeFence(text: string): string {
  const t = text.trim()
  if (!t.startsWith('```')) return t
  return t.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
}

export function parseTimelineJson(text: string): GeneratedTimeline {
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
