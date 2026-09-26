// Provider-neutral AI types.
//
// These live here rather than beside either direct client so that
// anthropicDirect.ts and openaiDirect.ts can both import them without
// importing each other. Before this file existed, `EnrichmentStreamHandlers`
// lived in eventEnrichment.ts and was imported *back* by anthropicDirect,
// which itself exports enrichEventDirect to eventEnrichment — a type-only
// cycle that a second provider would have doubled.

import type { EventSource, TimelineCategory } from './event'
import type { SubjectType } from '@/constants/pillDefinitions'

/** The BYOK providers a user can bring a key for. */
export type ByokProvider = 'anthropic' | 'openai'

/** A resolved key plus the provider it belongs to. */
export interface ByokCredential {
  provider: ByokProvider
  key: string
}

export interface EnrichmentStreamHandlers {
  onDelta: (text: string) => void
  onSources: (sources: EventSource[]) => void
  onDone: () => void
  /** `provider` is set when the failure came from a specific BYOK provider,
   *  so the UI can offer a retry against the other one. It is absent on the
   *  server-funded path, which has no user-chosen provider. */
  onError: (message: string, provider?: ByokProvider) => void
}

export interface GeneratedTimeline {
  timelineTitle: string
  timelineDescription: string
  categoryMapping?: Record<string, string>
  /** Optional: absent whenever the responding model or edge function predates
   *  chapters. Ids are assigned client-side, so the wire shape has none. */
  chapters?: Array<{
    label: string
    startDate: string
    endDate: string
  }>
  events: Array<{
    title: string
    startDate: string
    endDate: string
    category: TimelineCategory
  }>
}

/** The axis span, fixed by the stream's `meta` line before any event lands. */
export interface TimelineRange {
  startYear: number
  endYear: number
}

/**
 * The NDJSON lines a streaming generation emits, in the order the prompt
 * pins them: one `meta`, then every `chapter`, then every `event` ascending
 * by startDate, then one `done`.
 *
 * The order is load-bearing rather than tidy. `meta.range` fixes the axis
 * before the first event exists — the alternative is deriving the span from
 * the events seen so far, which re-lays out the grid on every earlier-dated
 * arrival. Events ascending is what lets the skeleton recede left to right
 * just ahead of them.
 */
export interface StreamMeta {
  title: string
  description: string
  range: TimelineRange
  categoryMapping?: Record<string, string>
}

export interface StreamChapter {
  label: string
  startDate: string
  endDate: string
}

export interface StreamEvent {
  title: string
  startDate: string
  endDate: string
  category: TimelineCategory
}

/**
 * One normalised handler set for all three routes — BYOK Anthropic, BYOK
 * OpenAI and the edge function — mirroring `EnrichmentStreamHandlers`.
 *
 * `onError` is terminal: a route calls it or `onDone`, never both.
 */
export interface TimelineStreamHandlers {
  onMeta: (meta: StreamMeta) => void
  onChapter: (chapter: StreamChapter) => void
  onEvent: (event: StreamEvent) => void
  onDone: () => void
  /** `provider` is set when the failure came from a specific BYOK provider,
   *  so the UI can offer a retry against the other one. */
  onError: (message: string, provider?: ByokProvider) => void
}

export interface ClassificationResult {
  type: SubjectType
}
