import { supabase } from '../lib/supabase'
import { enrichEventDirect } from './anthropicDirect'
import { getSessionToken } from './sessionToken'
import { getAnthropicKey } from './userApiKey'
import type { EventSource, TimelineEvent } from '../types/event'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface EnrichmentStreamHandlers {
  onDelta: (text: string) => void
  onSources: (sources: EventSource[]) => void
  onDone: () => void
  onError: (message: string) => void
}

export async function fetchEventImage(title: string): Promise<{
  imageUrl: string | null
  attribution: string | null
}> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/fetch-event-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ title }),
      },
    )
    if (!res.ok) return { imageUrl: null, attribution: null }
    const json = await res.json()
    return {
      imageUrl: json?.imageUrl ?? null,
      attribution: json?.attribution ?? null,
    }
  } catch {
    return { imageUrl: null, attribution: null }
  }
}

/**
 * Enrich an event with AI-generated description, sources, and image.
 *
 * Routing:
 *   - User has BYOK key set → call Anthropic directly from the browser.
 *     Bypasses our edge function, our rate limit, and our billing.
 *   - Signed-in user, no key → edge function authenticated via JWT.
 *   - Logged-out user, no key → edge function authenticated via the
 *     anonymous session token. Subject to the same 5/24h rate limit.
 */
export async function enrichEvent(
  event: TimelineEvent,
  timelineTitle: string,
  handlers: EnrichmentStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const byokKey = getAnthropicKey()
  if (byokKey) {
    await enrichEventDirect(event, timelineTitle, handlers, byokKey, signal)
    return
  }

  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  } else {
    headers['x-session-token'] = getSessionToken()
  }

  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/enrich-event`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventTitle: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        timelineTitle,
      }),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message || 'Network error')
    return
  }

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`
    try {
      const json = await res.json()
      if (json?.error) message = json.error
    } catch {
      // ignore parse errors
    }
    handlers.onError(message)
    return
  }

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
        if (eventName === 'delta') {
          const text = data.text as string | undefined
          if (text) handlers.onDelta(text)
        } else if (eventName === 'sources') {
          const sources = (data.sources as EventSource[] | undefined) ?? []
          handlers.onSources(sources)
        } else if (eventName === 'done') {
          handlers.onDone()
        } else if (eventName === 'error') {
          handlers.onError((data.message as string) || 'Generation failed')
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message || 'Stream interrupted')
  }
}
