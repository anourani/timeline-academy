import { supabase } from '../lib/supabase'
import { fetchWorldEventsDirect } from './anthropicDirect'
import { fetchWorldEventsOpenAIDirect } from './openaiDirect'
import { stripCodeFence } from './llmShared'
import { getActiveModel } from './userApiKey'
import {
  verifyWorldEvents,
  type VerifiedWorldEvent,
  type WorldEventCandidate,
} from './worldEventVerify'
import { countryName } from '@/constants/countries'
import type { WorldEventsPromptInput } from './llmPrompts'
import type { WorldEvent, WorldEventSource } from '@/types/worldEvents'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface WorldEventsRequest {
  source: WorldEventSource
  /** ISO alpha-2; only sent for the country source. */
  country: string
  startYear: number
  endYear: number
  /** The timeline's subject — every pick is judged against it. */
  subject?: string
  /** What the timeline is about, beyond its title: see `buildWorldEventsContext`. */
  context?: WorldEventsContext
}

export interface WorldEventsContext {
  description?: string
  /** A spread of the timeline's own events, as "YYYY · Title". */
  highlights?: string[]
}

const MAX_HIGHLIGHTS = 20

/**
 * What the model needs to judge relevance: the timeline's description and up
 * to twenty of its own events, evenly spaced through the timeline so a long
 * one is represented end to end rather than by its first chapter.
 */
export function buildWorldEventsContext(
  description: string | undefined,
  events: Array<{ title: string; startDate: string }>,
): WorldEventsContext {
  const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const step = Math.max(1, sorted.length / MAX_HIGHLIGHTS)
  const highlights: string[] = []
  for (let i = 0; i < sorted.length && highlights.length < MAX_HIGHLIGHTS; i += step) {
    const e = sorted[Math.floor(i)]
    highlights.push(`${e.startDate.slice(0, 4)} · ${e.title}`.slice(0, 120))
  }
  return { description: description?.trim().slice(0, 300) || undefined, highlights }
}

/**
 * The most events one source may contribute: about three per decade of range,
 * never more than fifteen. A ceiling, not a target — the prompt tells the
 * model to return fewer when fewer are relevant to this timeline.
 */
export function maxEventsFor(startYear: number, endYear: number): number {
  const decades = Math.ceil((endYear - startYear + 1) / 10)
  return Math.min(15, Math.max(3, decades * 3))
}

/**
 * Fetch one source's World Events for a year range, with every date
 * fact-checked against Wikipedia and Wikidata before it is returned (see
 * worldEventVerify.ts).
 *
 * Routing matches event enrichment:
 *   - a BYOK key → the chosen model, browser-direct, on the user's key;
 *   - signed in, no key → the `world-events` edge function (server-funded,
 *     30/day per user, model pinned server-side);
 *   - neither → an error. The Design menu disables the switch before this
 *     can happen; the throw is the backstop.
 *
 * Anything that isn't `{ events: [...] }` throws rather than resolving to an
 * empty list. That is deliberate: the site routinely deploys before the
 * function does, and a missing function (404) or an unexpected body must
 * surface as "couldn't load", never as "nothing happened in these years".
 */
export async function fetchWorldEvents(
  req: WorldEventsRequest,
  signal?: AbortSignal,
): Promise<WorldEvent[]> {
  const maxEvents = maxEventsFor(req.startYear, req.endYear)
  const input: WorldEventsPromptInput = {
    source: req.source,
    countryName: req.source === 'country' ? countryName(req.country) : undefined,
    startYear: req.startYear,
    endYear: req.endYear,
    subject: req.subject?.slice(0, 200),
    description: req.context?.description,
    highlights: req.context?.highlights,
    maxEvents,
  }

  const active = getActiveModel()
  let raw: unknown
  if (active) {
    const { model, credential } = active
    const text =
      model.provider === 'openai'
        ? await fetchWorldEventsOpenAIDirect(input, model, credential.key, signal)
        : await fetchWorldEventsDirect(input, model, credential.key, signal)
    try {
      raw = JSON.parse(stripCodeFence(text))
    } catch {
      throw new Error('The model returned invalid JSON for world events')
    }
  } else {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) throw new Error('Sign in or add your own API key to use world events.')

    const res = await fetch(`${SUPABASE_URL}/functions/v1/world-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source: req.source,
        country: req.source === 'country' ? req.country : undefined,
        startYear: req.startYear,
        endYear: req.endYear,
        subject: input.subject,
        description: input.description,
        highlights: input.highlights,
        maxEvents,
      }),
      signal,
    })
    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      // handled below
    }
    if (!res.ok) {
      const message = (json as { error?: unknown } | null)?.error
      throw new Error(typeof message === 'string' ? message : `Request failed (${res.status})`)
    }
    raw = json
  }

  const candidates = parseWorldEvents(raw, req, maxEvents)
  const verified = await verifyWorldEvents(candidates, signal)
  return toWorldEvents(verified, req)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function yearBounds(req: WorldEventsRequest): { min: string; max: string } {
  return {
    min: `${String(req.startYear).padStart(4, '0')}-01-01`,
    max: `${String(req.endYear).padStart(4, '0')}-12-31`,
  }
}

/**
 * Validate a reply line by line. Bad items are dropped rather than failing the
 * whole list — one malformed date shouldn't cost the user every other event —
 * but a reply with no `events` array at all is an error.
 *
 * These are only candidates: their dates are the model's until
 * `verifyWorldEvents` has checked them.
 */
export function parseWorldEvents(
  raw: unknown,
  req: WorldEventsRequest,
  maxEvents: number,
): WorldEventCandidate[] {
  const list = (raw as { events?: unknown } | null)?.events
  if (!Array.isArray(list)) throw new Error('Unexpected world events response')

  const { min, max } = yearBounds(req)
  const out: WorldEventCandidate[] = []

  for (const item of list) {
    if (out.length >= maxEvents) break
    const obj = item as Record<string, unknown> | null
    const title = typeof obj?.title === 'string' ? obj.title.trim().slice(0, 80) : ''
    let startDate = typeof obj?.startDate === 'string' ? obj.startDate : ''
    let endDate = typeof obj?.endDate === 'string' ? obj.endDate : ''
    if (!title || !DATE_RE.test(startDate)) continue
    if (!DATE_RE.test(endDate)) endDate = startDate
    if (endDate < startDate) [startDate, endDate] = [endDate, startDate]
    if (startDate < min || endDate > max) continue
    const wikipedia = typeof obj?.wikipedia === 'string' ? obj.wikipedia.trim().slice(0, 250) : ''
    out.push({ title, startDate, endDate, ...(wikipedia ? { wikipedia } : {}) })
  }
  return out
}

/**
 * Checked events into lane entries. The range is enforced again here because
 * a corrected date can move an event out of it — and the lane never widens
 * the axis.
 */
function toWorldEvents(verified: VerifiedWorldEvent[], req: WorldEventsRequest): WorldEvent[] {
  const { min, max } = yearBounds(req)
  const out: WorldEvent[] = []
  for (const v of verified) {
    if (v.startDate < min || v.endDate > max) continue
    // The country is part of the id, so two countries' lists never share one.
    const scope = req.source === 'country' ? `country-${req.country}` : req.source
    out.push({
      id: `we:${scope}:${hash(`${v.title}|${v.startDate}`)}`,
      title: v.title,
      startDate: v.startDate,
      endDate: v.endDate,
      source: req.source,
      article: v.article,
      ...(req.source === 'country' ? { country: req.country } : {}),
    })
  }
  return dedupeWorldEvents(out)
}

/**
 * One entry per real-world event, first one wins.
 *
 * Two sources often pick the same event — a national crisis is also world
 * news — and the model titles it differently each time ("World's Columbian
 * Exposition" / "… opens"). Every entry has been matched to a Wikipedia
 * article by now, so the article is the identity; title and start date are
 * the fallback for entries cached before articles were recorded. Callers pass
 * lists in source order (country first), so the more specific tag survives.
 */
export function dedupeWorldEvents(events: WorldEvent[]): WorldEvent[] {
  const seen = new Set<string>()
  return events.filter((e) => {
    const keys = [
      `id:${e.id}`,
      ...(e.article ? [`article:${e.article.title.toLowerCase()}`] : []),
      `title:${e.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${e.startDate}`,
    ]
    if (keys.some((k) => seen.has(k))) return false
    keys.forEach((k) => seen.add(k))
    return true
  })
}

/** A short stable hash, so an event keeps its id (and cached description) across refetches. */
function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
