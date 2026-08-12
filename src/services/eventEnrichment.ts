import { supabase } from '../lib/supabase'
import { enrichEventDirect } from './anthropicDirect'
import { enrichEventOpenAIDirect } from './openaiDirect'
import { readSseStream } from './llmShared'
import { getActiveCredential, getCredentialFor } from './userApiKey'
import { fetchWikipediaImage } from './wikipediaImage'
import type { ByokProvider, EnrichmentStreamHandlers } from '@/types/ai'
import type { EventSource, TimelineEvent } from '../types/event'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Moved to @/types/ai so both direct clients can import it without going
// through this module. Re-exported so existing importers keep working.
export type { EnrichmentStreamHandlers } from '@/types/ai'

export async function fetchEventImage(title: string): Promise<{
  imageUrl: string | null
  attribution: string | null
}> {
  // Browser-direct Wikipedia lookup — no server round-trip.
  return fetchWikipediaImage(title)
}

/**
 * Enrich an event with AI-generated description, sources, and image.
 *
 * Routing:
 *   - User has a BYOK key set → call that provider directly from the browser.
 *     Bypasses our edge function, our rate limit, and our billing.
 *   - Signed-in user, no key → edge function authenticated via JWT.
 *   - Logged out with no key → server-funded enrichment is not available;
 *     the UI gates this path behind sign-in-or-BYOK before it gets here.
 *
 * `providerOverride` targets one provider for a single call — the retry
 * action after a provider failure. It deliberately does not change the
 * stored default.
 */
export async function enrichEvent(
  event: TimelineEvent,
  timelineTitle: string,
  handlers: EnrichmentStreamHandlers,
  signal?: AbortSignal,
  providerOverride?: ByokProvider,
): Promise<void> {
  const credential = providerOverride
    ? getCredentialFor(providerOverride)
    : getActiveCredential()

  if (credential) {
    if (credential.provider === 'openai') {
      await enrichEventOpenAIDirect(
        event,
        timelineTitle,
        handlers,
        credential.key,
        signal,
      )
    } else {
      await enrichEventDirect(
        event,
        timelineTitle,
        handlers,
        credential.key,
        signal,
      )
    }
    return
  }

  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token
  if (!token) {
    handlers.onError('Sign in or add your own API key to generate event descriptions.')
    return
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
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

  // Note: these are our own SSE event names from the edge function, not
  // Anthropic's — the function translates the provider stream before it
  // reaches the browser.
  try {
    await readSseStream(res.body, (eventName, data) => {
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
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message || 'Stream interrupted')
  }
}
