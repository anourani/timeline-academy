import { supabase } from '../lib/supabase'
import { fetchWorldEventsDirect } from './anthropicDirect'
import { fetchWorldEventsOpenAIDirect } from './openaiDirect'
import { stripCodeFence } from './llmShared'
import { getActiveModel } from './userApiKey'
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
  /** The timeline's subject, for relevance ranking only. */
  subject?: string
}

/**
 * How many events one source may contribute: about five per decade of range,
 * so the lane stays readable at every span — never fewer than four, and
 * capped where a long range would otherwise drown the user's own events.
 */
export function maxEventsFor(startYear: number, endYear: number): number {
  const decades = Math.ceil((endYear - startYear + 1) / 10)
  return Math.min(30, Math.max(4, decades * 5))
}

/**
 * Fetch one source's World Events for a year range.
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

  return parseWorldEvents(raw, req, maxEvents)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validate a reply line by line. Bad items are dropped rather than failing the
 * whole list — one malformed date shouldn't cost the user every other event —
 * but a reply with no `events` array at all is an error.
 */
export function parseWorldEvents(
  raw: unknown,
  req: WorldEventsRequest,
  maxEvents: number,
): WorldEvent[] {
  const list = (raw as { events?: unknown } | null)?.events
  if (!Array.isArray(list)) throw new Error('Unexpected world events response')

  const min = `${String(req.startYear).padStart(4, '0')}-01-01`
  const max = `${String(req.endYear).padStart(4, '0')}-12-31`
  const seen = new Set<string>()
  const out: WorldEvent[] = []

  for (const item of list) {
    if (out.length >= maxEvents) break
    const obj = item as Record<string, unknown> | null
    const title = typeof obj?.title === 'string' ? obj.title.trim().slice(0, 80) : ''
    let startDate = typeof obj?.startDate === 'string' ? obj.startDate : ''
    let endDate = typeof obj?.endDate === 'string' ? obj.endDate : ''
    if (!title || !DATE_RE.test(startDate)) continue
    if (!DATE_RE.test(endDate)) endDate = startDate
    if (endDate < startDate) [startDate, endDate] = [endDate, startDate]
    // Only what fits the timeline's existing span: the lane never widens the axis.
    if (startDate < min || endDate > max) continue

    // The country is part of the id, so two countries' lists never share one.
    const scope = req.source === 'country' ? `country-${req.country}` : req.source
    const id = `we:${scope}:${hash(`${title}|${startDate}`)}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      title,
      startDate,
      endDate,
      source: req.source,
      ...(req.source === 'country' ? { country: req.country } : {}),
    })
  }
  return out
}

/** A short stable hash, so an event keeps its id (and cached description) across refetches. */
function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
