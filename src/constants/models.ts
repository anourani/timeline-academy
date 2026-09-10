// The model registry — the single source of truth for which LLMs the model
// selector offers, and for every per-model difference in the request bodies
// the browser-direct clients send.
//
// Only the client imports this. The Edge Functions never select a model: the
// server-funded path is pinned to Haiku (classify) and Sonnet (generate,
// enrich) inside supabase/functions/, and `generate-timeline` deliberately
// does not read a `model` field from the request body. So there is no
// `_shared/` copy of this file to keep in sync, and nothing here can change
// what our server spends.
//
// Model IDs are complete as written; do not append date suffixes.
//
// ---------------------------------------------------------------------------
// Why these tiers, and why the choice is the user's now
// ---------------------------------------------------------------------------
//
// This comment used to sit above `MODEL_SONNET` in anthropicDirect.ts, where
// it argued against "upgrading" the pin to a frontier model. The reasoning
// still holds and is why `DEFAULT_MODEL_BY_PROVIDER` stays mid-tier: this
// workload is bounded JSON generation and short prose, so Opus- and
// Fable-tier models cost several times as much for a difference the user may
// not be able to see. What changed is who decides. BYOK spend lands on the
// user's own account, so the frontier models are offered rather than
// withheld — but nobody is moved off the mid-tier default until they open the
// dropdown themselves.

import type { ByokProvider } from '@/types/ai'
import type { AccountTier } from '@/hooks/useAccountTier'

/** Body fields spread into a request, on top of `{ model, ...the shared shape }`. */
export type RequestParams = Record<string, unknown>

/** The three calls a chosen model answers. One choice, one account billed. */
export type CallKind = 'classify' | 'generate' | 'enrich'

export interface ModelDef {
  /** API model string; also the value persisted in `timeline_byok_model`. */
  id: string
  provider: ByokProvider
  /** Display name, e.g. "Claude Sonnet". Carries the version when the
   *  provider's own name does ("GPT-5.6 Terra"). */
  label: string
  /** Outcome-focused and deliberately version-free, so the copy survives the
   *  next id rotation. */
  descriptor: 'Fastest' | 'Balanced' | 'Most capable'
  /** True for the one model the server-funded (Free) path runs.
   *
   *  Not a tier list: the code's tier model is two axes (account, key), and
   *  the only tier-shaped fact about a model is whether our server runs it.
   *  Everything else is "do you have this provider's key". */
  serverFunded: boolean
  /** Per-model, per-call request-body overrides. See "Why params is not
   *  optional" below. */
  params: Record<CallKind, RequestParams>
}

// ---------------------------------------------------------------------------
// Why `params` is not optional
// ---------------------------------------------------------------------------
//
// Every per-model difference lives here. The adapters apply
// `{ ...sharedShape, model: def.id, ...def.params[call] }` and contain no
// per-model branches, so a future pin rotation is a registry edit rather than
// an adapter edit.
//
// The differences that forced this (verified against Anthropic's current model
// docs, 10 Sep):
//
//   - `thinking: { type: 'disabled' }` is a 400 on claude-fable-5-1 — thinking
//     is always on there. Both generation calls used to send exactly that, so
//     picking Fable with the old request body would have failed every time.
//   - Claude Opus 5 accepts `disabled`, but with thinking off it can leak
//     `<thinking>` tags into the visible text, which `parseTimelineJson` would
//     reject. Omitting `thinking` (adaptive is the default on Opus 5, Sonnet 5
//     and Fable alike) and lowering `output_config.effort` is both cheaper and
//     safer.
//   - `max_tokens` caps thinking PLUS the response, so every model that thinks
//     needs a ceiling sized for both. It is a ceiling, not a charge: raising it
//     costs nothing unless the tokens are produced.
//   - Assistant prefill and `temperature` are both rejected by every model in
//     this list. The classify call used both; see CLASSIFY_FORMAT.

/**
 * Structured output for the classification call, on every Anthropic model.
 *
 * Classify used to force its shape with an assistant prefill
 * (`{"type": "` as the start of the reply) plus `temperature: 0`. Both are
 * 400s on Sonnet 5, Opus 5 and Fable 5.1, so they had to go — but dropping
 * them without a replacement would leave nothing stopping a thinking model
 * from answering in a sentence, which is the exact failure the prefill
 * existed to prevent, and it would surface as a silent fall back to 'topic'.
 *
 * `output_config.format` is supported on all three models and is a stronger
 * guarantee than the prefill ever was: the reply is constrained to the schema
 * rather than merely started in the right shape.
 */
const CLASSIFY_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['person', 'event', 'topic', 'organization'],
      },
    },
    required: ['type'],
    additionalProperties: false,
  },
} as const

/**
 * Anthropic's web-search tool, as enrichment declares it.
 *
 * Provider-level and identical across the three Anthropic models today — the
 * `_20260209` variant is accepted on Sonnet 5, Opus 5 and Fable 5.1 — but it
 * lives in `params` rather than in the adapter so that a model needing a
 * different variant stays a registry edit. An enrichment whose web search
 * never fires produces a description with an empty Sources list and no error,
 * which is the quietest failure in this codebase.
 */
const ANTHROPIC_WEB_SEARCH = {
  tools: [
    {
      // Dynamic filtering: results are filtered before they reach the context
      // window. Enrichment cost is dominated by search-result input tokens,
      // so this is the cheapest lever available here.
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: 3,
    },
  ],
}

/** OpenAI's Responses-API enrichment shape, shared by all three models. */
const OPENAI_WEB_SEARCH = {
  tools: [{ type: 'web_search' }],
  include: ['web_search_call.action.sources'],
  // NOT cosmetic: the Responses API defaults to store: true, which persists
  // the user's prompts and our outputs into THEIR OpenAI dashboard. The
  // Anthropic path has no equivalent, and the privacy policy describes
  // neither. Leave this false.
  store: false,
}

/** Ceiling for a call whose budget now covers thinking as well as the answer. */
const THINKING_CEILING = 16384

export const MODELS: ModelDef[] = [
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    label: 'Claude Sonnet',
    descriptor: 'Fastest',
    // The one model our server runs, so it is the only one a keyless visitor
    // can reach. If DEFAULT_LLM_PROVIDER is ever flipped to "openai", this
    // flag becomes a lie and nothing in the code will notice — see the note
    // beside the pin in supabase/functions/_shared/llm-client.ts.
    serverFunded: true,
    params: {
      classify: {
        // Sonnet 5 runs adaptive thinking when `thinking` is omitted, so the
        // old `max_tokens: 32` (sized for a prefilled one-word answer) would
        // now truncate inside the reasoning. `effort: 'low'` keeps that cheap.
        max_tokens: 2048,
        output_config: { effort: 'low', format: CLASSIFY_FORMAT },
      },
      generate: {
        // Today's body, unchanged. Sonnet 5 accepts `disabled`, and this call
        // emits a fixed JSON schema with no tools, so there is nothing for
        // reasoning to improve and adaptive thinking would eat into the same
        // budget the JSON needs.
        max_tokens: 4096,
        thinking: { type: 'disabled' },
      },
      enrich: {
        // Thinking deliberately left on: with it off, Sonnet 5 reaches for
        // tools noticeably less often, and this call is only worth making if
        // web_search actually fires.
        max_tokens: 4096,
        ...ANTHROPIC_WEB_SEARCH,
      },
    },
  },
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    label: 'Claude Opus',
    descriptor: 'Balanced',
    serverFunded: false,
    params: {
      classify: {
        max_tokens: 2048,
        output_config: { effort: 'low', format: CLASSIFY_FORMAT },
      },
      generate: {
        // No `thinking` key: adaptive is Opus 5's default, and disabling it
        // risks `<thinking>` tags in the text that parseTimelineJson would
        // reject. Low effort is the cheap way to keep a schema emit short.
        max_tokens: THINKING_CEILING,
        output_config: { effort: 'low' },
      },
      enrich: {
        // Effort left at the API default here, unlike generate: this call
        // depends on the model deciding to search, and that is the one place
        // in the app where more reasoning earns its cost.
        max_tokens: THINKING_CEILING,
        ...ANTHROPIC_WEB_SEARCH,
      },
    },
  },
  {
    id: 'claude-fable-5-1',
    provider: 'anthropic',
    label: 'Claude Fable',
    descriptor: 'Most capable',
    serverFunded: false,
    params: {
      classify: {
        max_tokens: 2048,
        output_config: { effort: 'low', format: CLASSIFY_FORMAT },
      },
      generate: {
        // `thinking` MUST be absent — Fable 5.1 rejects every explicit value,
        // `{ type: 'disabled' }` included, with a 400.
        max_tokens: THINKING_CEILING,
        output_config: { effort: 'low' },
      },
      enrich: {
        max_tokens: THINKING_CEILING,
        ...ANTHROPIC_WEB_SEARCH,
      },
    },
  },
  {
    id: 'gpt-5.6-luna',
    provider: 'openai',
    label: 'GPT-5.6 Luna',
    descriptor: 'Fastest',
    serverFunded: false,
    params: {
      classify: {
        response_format: { type: 'json_object' },
        max_tokens: 256,
      },
      generate: {
        response_format: { type: 'json_object' },
        max_tokens: 8192,
      },
      enrich: {
        max_output_tokens: 4096,
        ...OPENAI_WEB_SEARCH,
      },
    },
  },
  {
    id: 'gpt-5.6-terra',
    provider: 'openai',
    label: 'GPT-5.6 Terra',
    descriptor: 'Balanced',
    serverFunded: false,
    params: {
      classify: {
        response_format: { type: 'json_object' },
        // Looser than Luna's 256: classify only ever ran on the budget model
        // before the chosen model started answering all three calls, and a
        // reasoning-capable model may spend tokens before it emits. Still
        // fractions of a cent.
        max_tokens: 1024,
      },
      generate: {
        response_format: { type: 'json_object' },
        max_tokens: 8192,
      },
      enrich: {
        max_output_tokens: 4096,
        ...OPENAI_WEB_SEARCH,
      },
    },
  },
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    label: 'GPT-6 Astra',
    descriptor: 'Most capable',
    serverFunded: false,
    // UNVERIFIED against a live key. Astra is a new generation whose parameter
    // contract we could not check from the dev container (OpenAI's docs are
    // egress-blocked) and whose rollout was still staged on 10 Sep, so these
    // are a deliberate copy of Terra's rather than a guess at what changed.
    // An account the rollout has not reached gets readApiError()'s
    // "Your API key can't reach gpt-6-astra" sentence, not a generic failure.
    // Confirm `response_format` and `max_tokens` on a key that can reach it
    // before treating this entry as verified.
    params: {
      classify: {
        response_format: { type: 'json_object' },
        max_tokens: 1024,
      },
      generate: {
        response_format: { type: 'json_object' },
        max_tokens: 8192,
      },
      enrich: {
        max_output_tokens: 4096,
        ...OPENAI_WEB_SEARCH,
      },
    },
  },
]

/**
 * The model a provider falls back to — today's pins, so nobody's generation
 * changes model until they open the dropdown themselves.
 */
export const DEFAULT_MODEL_BY_PROVIDER: Record<ByokProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.6-terra',
}

/**
 * Dropdown group order. Deliberately not `PROVIDER_ORDER` from
 * byokProviders.ts, which leads with OpenAI on the key screens: the dropdown
 * leads with Anthropic. The two orders differ on purpose.
 */
export const MODEL_GROUP_ORDER: ByokProvider[] = ['anthropic', 'openai']

export function getModelById(id: string | null): ModelDef | undefined {
  return id ? MODELS.find((m) => m.id === id) : undefined
}

/** Why a model is not selectable. Adding a key is the only thing that unlocks
 *  one — signing in moves trial → free, which is still Sonnet-only, so there
 *  is no login-specific reason. */
export type LockReason = 'anthropic_key' | 'openai_key'

export interface ModelAvailability {
  model: ModelDef
  locked: boolean
  lockReason?: LockReason
}

/**
 * Every model, in dropdown order, with whether this visitor can select it.
 *
 *   loading    → nothing is selectable; the caller renders a disabled trigger.
 *                Same rule useAccountTier already imposes on every consumer:
 *                answering as though the visitor were signed out during the
 *                auth window points them at the wrong answer.
 *   no key     → only the serverFunded model, which is what our server runs.
 *   has key(s) → a model is unlocked iff there is a key for its provider.
 *                Sonnet included: on BYOK it runs on the user's Anthropic key
 *                like every other Anthropic model, so an OpenAI-only user has
 *                no way to reach it.
 */
export function getModelAvailability(
  tier: AccountTier,
  keys: { anthropic: boolean; openai: boolean },
): ModelAvailability[] {
  const hasAnyKey = keys.anthropic || keys.openai

  return orderedModels().map((model) => {
    const reason: LockReason =
      model.provider === 'anthropic' ? 'anthropic_key' : 'openai_key'

    if (tier === 'loading') return { model, locked: true, lockReason: reason }

    const unlocked = hasAnyKey ? keys[model.provider] : model.serverFunded
    return unlocked ? { model, locked: false } : { model, locked: true, lockReason: reason }
  })
}

function orderedModels(): ModelDef[] {
  return MODEL_GROUP_ORDER.flatMap((provider) =>
    MODELS.filter((m) => m.provider === provider),
  )
}

/** The models of one provider, in registry order. For grouped rendering. */
export function modelsByProvider(provider: ByokProvider): ModelDef[] {
  return MODELS.filter((m) => m.provider === provider)
}

/**
 * The requested id if these keys can reach it, else the active provider's
 * default.
 *
 * The fallback carries over the "exactly one key wins" rule the credential
 * resolver has always had, applied to the model id instead of the provider.
 * That rule is load-bearing, not an optimisation: a user whose stored choice
 * points at a provider they no longer have a key for would otherwise read as
 * `byok` to the tier logic (a key exists) but as "no key" to the routing
 * logic — a split brain that surfaces as a sign-in gate they should never
 * see. Requiring `keys[model.provider]` before honouring a request closes
 * exactly that gap.
 *
 * So a user who saved Opus and then removed their Anthropic key silently runs
 * on Terra if they have an OpenAI key, and is gated to sign-in-or-key if they
 * have neither — exactly what happens to them today.
 *
 * The stale preference is deliberately NOT cleared when its provider's key
 * goes away, for the same reason the provider preference wasn't: re-adding
 * the key restores what the user actually asked for.
 */
export function resolveModelId(
  requested: string | null,
  keys: { anthropic: boolean; openai: boolean },
): string {
  const model = getModelById(requested)
  if (model && keys[model.provider]) return model.id

  // The only provider with a key wins; Anthropic breaks the tie when both or
  // neither is present. With no key at all the caller is on the server path,
  // where Anthropic's default is also the serverFunded model — which is why
  // the dropdown shows Sonnet selected there.
  const provider: ByokProvider =
    keys.anthropic === keys.openai ? 'anthropic' : keys.anthropic ? 'anthropic' : 'openai'

  return DEFAULT_MODEL_BY_PROVIDER[provider]
}
