// Provider-neutral helpers shared by anthropicDirect.ts and openaiDirect.ts.
//
// This module must not import either direct client — it sits below both.
//
// `parseTimelineJson` is a near-duplicate of `parseAndValidate` in
// supabase/functions/_shared/llm-client.ts. The two runtimes cannot share a
// module, so the duplication is deliberate; keep them behaviourally identical,
// the same convention llmPrompts.ts follows for the prompt text.

import { PROVIDER_META } from '@/constants/byokProviders'
import type {
  ByokProvider,
  GeneratedTimeline,
  StreamChapter,
  StreamEvent,
  StreamMeta,
} from '@/types/ai'

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
 * would otherwise surface as a bare "API error (404)". This is also the
 * sentence an account the GPT-6 Astra rollout has not reached will see.
 *
 * Pass `provider` for the same treatment on a 401, where the provider's own
 * message ("Incorrect API key provided: sk-...") leaks part of the key into
 * the UI and still doesn't say which of the two fields is wrong.
 */
export async function readApiError(
  res: Response,
  label: string,
  model?: string,
  provider?: ByokProvider,
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

  if (provider && res.status === 401) {
    return `Your ${PROVIDER_META[provider].label} key was rejected. Check it in settings, or replace it with a new one.`
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

/**
 * Splits NDJSON text into complete lines, tolerating any chunking.
 *
 * Two callers need this over different inputs: the edge-function route reads
 * a raw NDJSON body, while the BYOK routes receive the same NDJSON as text
 * deltas inside a provider's SSE frames. Both push arbitrary fragments and
 * need whole lines out, so the buffering lives here once.
 *
 * Deliberately forgiving. A chunk boundary can fall anywhere, so only text up
 * to the last newline is parsed; a line that will not parse is skipped rather
 * than thrown. A model that opens with a stray code fence should cost us that
 * line, not the generation. `end()` flushes the trailing partial, which is
 * what makes truncation degrade gracefully: every complete line already
 * delivered stands, and only the severed last one is lost.
 */
export interface NdjsonLineReader {
  push: (text: string) => void
  end: () => void
}

export function createNdjsonLineReader(
  onLine: (line: Record<string, unknown>) => void,
): NdjsonLineReader {
  let buffer = ''

  const flush = (raw: string) => {
    const text = raw.trim()
    if (!text || text.startsWith('```')) return
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      onLine(parsed as Record<string, unknown>)
    }
  }

  return {
    push(text: string) {
      buffer += text
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        flush(buffer.slice(0, idx))
        buffer = buffer.slice(idx + 1)
      }
    },
    end() {
      flush(buffer)
      buffer = ''
    },
  }
}

/**
 * Read a raw NDJSON response body, handing each complete line to `onLine`.
 *
 * The edge-function route's counterpart to `readSseStream` above. `{ stream:
 * true }` on the decoder matters: without it a multi-byte character split
 * across a chunk boundary decodes to a replacement character.
 */
export async function parseNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onLine: (line: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const lines = createNdjsonLineReader(onLine)

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    lines.push(decoder.decode(value, { stream: true }))
  }

  lines.end()
}

const VALID_CATEGORIES = new Set([
  'category_1',
  'category_2',
  'category_3',
  'category_4',
])

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Per-line validators for the streaming path.
 *
 * Each returns null rather than throwing: one malformed line must not end a
 * generation that is otherwise fine, which is the same bargain `parseChapters`
 * strikes below. They apply the same rules `parseTimelineJson` applies to the
 * buffered shape — the 55- and 30-character caps, the category allow-list —
 * so a timeline looks identical whichever transport produced it.
 */
export function validateStreamMeta(line: Record<string, unknown>): StreamMeta | null {
  if (!nonEmptyString(line.title)) return null
  const range = line.range as Record<string, unknown> | undefined
  if (!range || typeof range !== 'object') return null
  const startYear = Number(range.startYear)
  const endYear = Number(range.endYear)
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null
  if (endYear < startYear) return null

  const mapping =
    line.categoryMapping &&
    typeof line.categoryMapping === 'object' &&
    !Array.isArray(line.categoryMapping)
      ? (line.categoryMapping as Record<string, string>)
      : undefined

  return {
    title: line.title,
    description: typeof line.description === 'string' ? line.description : '',
    range: { startYear, endYear },
    categoryMapping: mapping,
  }
}

export function validateStreamChapter(
  line: Record<string, unknown>,
): StreamChapter | null {
  if (
    !nonEmptyString(line.label) ||
    !nonEmptyString(line.startDate) ||
    !nonEmptyString(line.endDate)
  ) {
    return null
  }
  return {
    label: line.label.slice(0, 30),
    startDate: line.startDate,
    endDate: line.endDate,
  }
}

export function validateStreamEvent(
  line: Record<string, unknown>,
): StreamEvent | null {
  if (
    !nonEmptyString(line.title) ||
    !nonEmptyString(line.startDate) ||
    !nonEmptyString(line.endDate) ||
    typeof line.category !== 'string' ||
    !VALID_CATEGORIES.has(line.category)
  ) {
    return null
  }
  return {
    title: line.title.slice(0, 55),
    startDate: line.startDate,
    endDate: line.endDate,
    category: line.category as StreamEvent['category'],
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
    chapters: parseChapters(obj.chapters),
    events,
  }
}

/**
 * Chapters are optional and never fatal.
 *
 * The site and the edge functions deploy on separate pipelines, so a browser
 * running the new bundle routinely talks to a function still emitting the old
 * shape (and cached bundles stretch that window further). A timeline without
 * chapters simply renders no strip — throwing here would turn a normal deploy
 * gap into a broken Generate button.
 */
function parseChapters(
  raw: unknown,
): Array<{ label: string; startDate: string; endDate: string }> | undefined {
  if (!Array.isArray(raw)) return undefined

  const chapters = (raw as Array<Record<string, unknown>>)
    .filter(
      (c) =>
        typeof c.label === 'string' &&
        c.label.length > 0 &&
        typeof c.startDate === 'string' &&
        c.startDate.length > 0 &&
        typeof c.endDate === 'string' &&
        c.endDate.length > 0,
    )
    .map((c) => ({
      label: (c.label as string).slice(0, 30),
      startDate: c.startDate as string,
      endDate: c.endDate as string,
    }))

  return chapters.length > 0 ? chapters : undefined
}
