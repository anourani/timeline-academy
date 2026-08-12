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
  events: Array<{
    title: string
    startDate: string
    endDate: string
    category: TimelineCategory
  }>
}

export interface ClassificationResult {
  type: SubjectType
}
