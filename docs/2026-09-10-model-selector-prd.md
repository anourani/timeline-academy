# PRD: Model Selector — 10 September 2026

**Project:** Timeline Academy
**Status:** Draft v2 — rewritten against the codebase at `9461ff7` (main, 9 Sep). Draft v1 (8 Sep) was written without a live audit; the audit is now done and is recorded in §1. Nothing has been built yet.

---

## 0. What we're building

A dropdown in the Create flow (`/`) that lets users pick which LLM generates their timeline. Six models across two providers. Anyone without a key for a provider sees that provider's models locked, with the locked rows telling them how to unlock.

**Why:** BYOK users are paying for their own tokens and should get to spend them on the model they want. For everyone else, the locked list is a low-effort upsell that shows what adding a key gets you.

**Two sentences to keep in mind.** The dropdown lists what your keys can reach, and the model you pick is the model that answers every AI call made with your key: classifying the subject, generating the timeline, and writing an event's description. Nothing in it changes what our server does, because our server never runs a model the user chose.

---

## 1. What the audit changed

Draft v1 assumed BYOK was Anthropic-only, keys lived in the database, and the Edge Function ran BYOK generations. None of that is true. The corrections below are the whole reason for v2; every step in §5 follows from them.

| # | v1 assumed | What the code actually does | Consequence |
|---|---|---|---|
| A1 | OpenAI BYOK is new work (Steps 6–7, "roughly doubles the backend") | **Shipped 12 August.** Two-field key modal (`src/components/Modal/ApiKeyModal.tsx`), OpenAI browser-direct client (`src/services/openaiDirect.ts`), default-provider picker, CSP entry. See `docs/2026-08-12-openai-byok-prd.md`. | Steps 6–7 deleted. The work is roughly half of v1. |
| A2 | Keys are stored server-side (`anthropic_key` column) | Keys live **only in the browser**: three `localStorage` slots in `src/services/userApiKey.ts:11-13` (`timeline_byok_anthropic_key`, `timeline_byok_openai_key`, `timeline_byok_provider`). The server knows a boolean `byok_enabled` in `app_metadata`, never the key or the provider. | The server cannot know which keys a user has, so it cannot resolve a model for them — and doesn't need to (A3). |
| A3 | The Edge Function runs every generation and needs a `model` param | **BYOK generation never touches our server.** `generateTimeline()` in `src/services/aiTimeline.ts:102` branches: key present → browser-direct to the provider; no key → `generate-timeline` Edge Function, which requires sign-in and hardcodes Sonnet (`supabase/functions/_shared/llm-client.ts:116`). The only people who reach the function are Free-tier users, who are Sonnet-only by decision D2. | Step 3 inverts: the Edge Function must **not** accept `model`. D2's "enforced server-side" is satisfied by leaving the function exactly as it is. |
| A4 | A `profiles` table exists to hold `preferred_model` | **No profiles table.** The schema is `timelines`, `events`, `ai_rate_limits`, and a vestigial `timeline_categories`. `get_user_plan` carries a TODO about a future `user_profiles`. | Creating one is a migration, and migrations here are applied by hand and have drifted before (`CLAUDE.md` → Critical operational rules). D6 amended: `localStorage` for everyone, next to the keys the choice depends on. Zero SQL. |
| A5 | "Sonnet is available to every tier" | Sonnet on BYOK runs on the **user's Anthropic key** like every other Anthropic model. An OpenAI-only BYOK user has no way to reach Sonnet: `resolveActive()` in `userApiKey.ts` routes them to OpenAI, where the current pin is `gpt-5.6-terra`. | Sonnet is locked for OpenAI-only users, and the default for them must be Terra (today's behaviour), not Sonnet. D7 amended. |
| A6 | Guest and Free unlock differently ("Log in" vs "Add a key") | Signing in moves `trial` → `free`, which is **still Sonnet-only**. The only action that unlocks any model, for any tier, is adding a key. The key modal already offers sign-in as a secondary link. | The `login` lock reason is dropped. One footer copy for everyone without a key. D3 amended. |
| A7 | Per-model request tweaks can wait until Step 8 | `claude-fable-5-1` **rejects `thinking: {type: 'disabled'}` with a 400**, and both generation calls send exactly that (`anthropicDirect.ts:179`, `llm-client.ts:129`). Picking Fable with today's request body fails every time. | Per-model `params` are part of the registry from Step 1, not a Step 8 afterthought. |
| A8 | `gpt-6-astra` is available | The id is real (`gpt-6-astra`, $10/$50 per MTok) but it began a **staged rollout on 3 Sep** — enterprise Trusted Access first, then "over the coming days" to the API. Whether a given ordinary key reaches it yet depends on the account. | **Astra ships anyway** (Alex, 10 Sep). `readApiError()` already turns a 403/404 into "Your API key can't reach *model*", so an account the rollout hasn't reached gets a clear sentence, not a generic failure. Step 0 confirms that sentence is what actually appears. |
| A9 | The event-detail panels might share the generation function | They don't share the function. They share the **constant**: `MODEL_SONNET` in `anthropicDirect.ts:31` and `MODEL_MAIN` in `openaiDirect.ts:36` are read by generation *and* enrichment. Classification uses `MODEL_HAIKU` / `MODEL_CHEAP` with assistant prefill, which Sonnet-tier and above reject. | Decided the other way (D8, Alex 10 Sep): the chosen model runs **all three** BYOK calls, so all four pins are deleted and every call reads the registry. The classify call must lose its prefill and its `temperature: 0` to run on anything above Haiku. Non-blocking question 1 from v1 is answered: they don't share the function, and the dropdown reaches the panels on purpose. |
| A10 | "Left of the generate button, matching the floating-toolbar / pill styling" | The Create page has no floating toolbar (that's the editor). The generate button is a blue ↵ **inside** the search field (`NewTimelineScreen.tsx:355`, desktop only, PR #107). The pill on this page is `glassButtonClass` (`src/components/ui/glassButton.ts`), used by the quick-search chips below the field. | Placement in §5 Step 4 rewritten around the actual layout. |
| A11 | Nothing said about it | `docs/2026-08-12-openai-byok-prd.md` §2 and §9 **explicitly reject a user-facing model picker**, listing it under "Decisions worth not re-litigating". | This PRD reverses that on Alex's call. Step 6 amends that doc so the two don't contradict. The cost argument it made is still valid and is carried into §3 as context. |

**About the two PRs merged since v1.** The chapters work (#110–#113, 8–9 Sep) added an optional `chapters` array to the generation response. It is parsed leniently on both paths (`parseChapters` in `src/services/llmShared.ts` and `_shared/llm-client.ts`): a model that omits or malforms chapters produces **no error**, just a timeline with no chapters strip. That is exactly the kind of regression a model switch causes silently, so Step 5 checks chapters per model explicitly. Otherwise those PRs don't touch anything here.

---

## 2. Decisions

Locked, with the audit's amendments marked. D3, D6, D7 and D8 were confirmed by Alex on 10 Sep, and D9 follows from D8.

| # | Decision | Status |
|---|---|---|
| D1 | UI is a plain dropdown (shadcn `Select` — present at `src/components/ui/select.tsx` with `SelectGroup`, `SelectLabel`, `SelectItem`, `SelectSeparator`). No slider, no thinking-effort control. | Locked |
| D2 | Guest and Free tiers are hard-locked to Claude Sonnet, enforced server-side. | Locked. **Already true**: the Edge Function reads only `subject`, `categories`, `mode` (`generate-timeline/index.ts:46`) and pins Sonnet. Enforcement = keep it that way (Step 3). |
| D3 | Locked models still render in the dropdown, disabled, with a lock icon and an unlock CTA row. | **Amended (A6), confirmed 10 Sep:** one unlock copy, "Add an API key to unlock more models", for every locked state. No login-specific copy. |
| D4 | Six models, grouped by provider: Anthropic (Sonnet, Opus, Fable) and OpenAI (Luna, Terra, Astra). | Locked. Astra stays in the list through its staged rollout (A8). **Anthropic group first** (Alex, 10 Sep) — this differs from `PROVIDER_ORDER` in `byokProviders.ts`, which lists OpenAI first on the key screens; see Step 4. |
| D5 | A provider's models unlock only with a key for that provider. | Locked. **Extends to Sonnet** (A5). |
| D6 | The chosen model is remembered. | **Amended (A4), confirmed 10 Sep:** `localStorage` slot `timeline_byok_model`, same pattern as `timeline_byok_provider`. No profile column, no migration. Rationale in §4. |
| D7 | Default is Claude Sonnet. | **Amended (A5), confirmed 10 Sep:** default is the provider's current pin — Sonnet for Anthropic, Terra for OpenAI — which is exactly what every existing user gets today. Nobody's generation changes model until they open the dropdown. |
| D8 *(new)* | **The chosen model answers every BYOK call**: classifying the subject, generating the timeline, and writing an event's description. Not just the provider — the model. | **Confirmed 10 Sep, widened from "classify + generate" to all three by Alex.** One choice, one account billed, one mental model. The server-funded path is untouched: Free users still get Haiku for classify and Sonnet for the rest, pinned in the Edge Functions. |
| D9 *(new)* | **The default-provider picker is removed.** With D8 covering all three calls, the picker has nothing left to decide. The model selector takes its place in editor settings. | Follows from D8 (10 Sep). Its storage slot is kept read-only to seed the model preference for existing users — §4. |

---

## 3. Model registry

Single source of truth. **Only the client imports it** (A3): the Edge Function never selects a model, so there is no `_shared/` copy to keep in sync.

Lives at `src/constants/models.ts` — beside `byokProviders.ts` and `plans.ts`, which is where this codebase keeps shared constants (`src/lib/` holds the Supabase client and limits cache, not constants).

| Provider | Display name | Descriptor | API model id | List price in → out ($/MTok) | Unlocks with |
|---|---|---|---|---|---|
| Anthropic | Claude Sonnet | Fastest | `claude-sonnet-5` | $2 → $10 | Anthropic key, or no key at all (server path) |
| Anthropic | Claude Opus | Balanced | `claude-opus-5` | $5 → $25 | Anthropic key |
| Anthropic | Claude Fable | Most capable | `claude-fable-5-1` | $10 → $50 | Anthropic key |
| OpenAI | GPT-5.6 Luna | Fastest | `gpt-5.6-luna` | $0.20 → $1.20 | OpenAI key |
| OpenAI | GPT-5.6 Terra | Balanced | `gpt-5.6-terra` | $2 → $12 | OpenAI key |
| OpenAI | GPT-6 Astra | Most capable | `gpt-6-astra` | $10 → $50 | OpenAI key |

Ids verified 10 Sep: the three Anthropic ids against Anthropic's current model list; `gpt-5.6-luna` and `gpt-5.6-terra` are already pinned in the code and were confirmed against OpenAI's pricing page; `gpt-6-astra` against OpenAI's announcement and pricing pages. **Model ids are complete as written — never append date suffixes.**

Prices are context for Alex, not UI (out of scope, §7). The point the 12 Aug PRD made still stands: this workload is bounded JSON. A generation on Sonnet costs roughly $0.02; the same generation on Fable or Astra costs roughly five times that, on the user's own account, for a difference they may not be able to see. Event descriptions are the bigger number: roughly $0.06 each on Sonnet, about half of it web-search fees that don't change with the model, so on Fable or Astra expect three to four times that per event opened. That is the user's call to make now, and the "Fastest / Balanced / Most capable" descriptors are deliberately version-free so the dropdown copy survives the next id rotation.

### Registry shape

```ts
import type { ByokProvider } from '@/types/ai'   // 'anthropic' | 'openai' — already exists

export interface ModelDef {
  id: string                 // API model string; also the persisted value
  provider: ByokProvider
  label: string              // "Claude Sonnet"
  descriptor: 'Fastest' | 'Balanced' | 'Most capable'
  /** True for the one model the server-funded (Free) path runs. */
  serverFunded: boolean
  /** Per-model, per-call request-body overrides. See "Why params is not optional". */
  params: {
    classify: RequestParams
    generate: RequestParams
    enrich: RequestParams
  }
}

export const DEFAULT_MODEL_BY_PROVIDER: Record<ByokProvider, string> = {
  anthropic: 'claude-sonnet-5',   // today's MODEL_SONNET
  openai: 'gpt-5.6-terra',        // today's MODEL_MAIN
}

/** Dropdown group order. Deliberately not PROVIDER_ORDER (Alex, 10 Sep). */
export const MODEL_GROUP_ORDER: ByokProvider[] = ['anthropic', 'openai']

export const MODELS: ModelDef[] = [ /* six entries per the table */ ]
```

`serverFunded` replaces v1's `tiers: Tier[]`. The code's tier model is two axes — account, key — not a list, and the only tier-shaped fact about a model is whether our server runs it. Everything else is "do you have this provider's key".

### Why `params` is not optional (A7)

The Anthropic generation call today sends `thinking: { type: 'disabled' }` and `max_tokens: 4096`. Per Anthropic's current docs:

| Model | `thinking: {type:'disabled'}` | Recommended for a fixed-JSON emit |
|---|---|---|
| Sonnet 5 | Accepted | Keep today's body unchanged. |
| Opus 5 | Accepted at default effort, but documented failure mode: with thinking off the model can leak `<thinking>` tags into the text, which would break `parseTimelineJson`. | Omit `thinking` (adaptive is the default), set `output_config: { effort: 'low' }`, raise `max_tokens` to 16384 because the cap now covers thinking *plus* the JSON. |
| Fable 5.1 | **400** — thinking is always on. | Same as Opus. Also check `stop_reason === 'refusal'` before reading `content`; Fable and Opus 5 can return it with HTTP 200. |

`max_tokens` is a ceiling, not a charge. Raising it costs nothing unless the tokens are produced.

**Classify** (`params.classify`) has the same shape of problem in miniature. Today it runs on Haiku with two things only Haiku still accepts: an assistant prefill (`{ role: 'assistant', content: '{"type": "' }`) and `temperature: 0` (`anthropicDirect.ts:200-243`). Every model in the dropdown rejects both with a 400. Step 3 removes them for all models; `max_tokens: 32` also has to grow on the thinking models, because the cap now covers thinking plus the one-word answer. `output_config: { effort: 'low' }` keeps that cheap.

**Enrich** (`params.enrich`) is the easy one on Anthropic: the call already leaves thinking on and sends no `thinking` key, so Fable accepts it as-is. Raise `max_tokens` for Opus and Fable for the same thinking-budget reason. What needs checking, not assuming: whether `web_search_20260209` is accepted on `claude-fable-5-1` — Anthropic's docs list it for the Opus and Sonnet families, and Fable's page should be read at Step 0. An enrichment whose web search never fires produces a description with an empty Sources list and no error (the 12 Aug PRD's failure mode), so this is a silent one.

The OpenAI side has fewer known hazards: all three run through Chat Completions with `response_format: { type: 'json_object' }` and `max_tokens: 8192`, no `temperature` (already removed for the reasoning-capable family). Astra's parameter contract is unverified — it is a new generation, and OpenAI's docs are egress-blocked from the dev container, same as on 12 Aug. Step 5 is where it gets checked, and if the test key can't reach Astra yet, its `params` entry starts as a copy of Terra's and is marked unverified in a comment rather than guessed.

Rule: **every per-model difference lives in `params`. The adapters apply `{ model: def.id, ...def.params[call] }` and contain no per-model branches.** A future pin change is then a registry edit, not an adapter edit.

### Helpers

```ts
export type LockReason = 'anthropic_key' | 'openai_key'

/** Every model, with whether this visitor can select it and why not. */
export function getModelAvailability(
  tier: AccountTier,                                  // from useAccountTier()
  keys: { anthropic: boolean; openai: boolean },      // from useByokKeys()
): Array<{ model: ModelDef; locked: boolean; lockReason?: LockReason }>

/** The requested id if these keys can reach it, else the active provider's default. */
export function resolveModelId(
  requested: string | null,
  keys: { anthropic: boolean; openai: boolean },
): string

/**
 * What a BYOK call should run on right now: the resolved model plus the key
 * for its provider, or null when there is no key (the server path). Replaces
 * getActiveCredential() as the one thing every call site asks.
 */
export function getActiveModel(
  override?: ByokProvider,   // the "Retry with X" action, one call only
): { model: ModelDef; credential: ByokCredential } | null
```

Availability logic, in words:

- `trial` or `free` (no key): only the `serverFunded` model is unlocked. Everything else is locked; the reason is the provider's key.
- `byok-anon` or `byok`: a model is unlocked iff `keys[model.provider]`. Sonnet included (A5).
- `loading`: the hook returns nothing selectable; the dropdown renders its trigger disabled. Same rule `useAccountTier` already imposes on every consumer (`CLAUDE.md` → Access & data model).

Fallback logic for `resolveModelId`, mirroring the load-bearing "exactly one key wins" branch in today's `resolveActive()`:

1. Requested id exists and its provider's key is present → return it.
2. Otherwise → `DEFAULT_MODEL_BY_PROVIDER[p]`, where `p` is the only provider with a key, or `anthropic` when both keys exist (same tie-break as today), or `anthropic` when there is no key (the server path — the dropdown shows Sonnet selected there because it is the `serverFunded` model).

`getActiveModel()` is `resolveModelId` plus `getCredentialFor(model.provider)`. With an `override`, it is `DEFAULT_MODEL_BY_PROVIDER[override]` plus that provider's key, and it does not touch the stored preference — the same contract today's `providerOverride` has.

So a user who saved Opus, then removes their Anthropic key, silently runs on Terra if they have an OpenAI key, and is gated to sign-in-or-key if they have neither — exactly what happens to them today. The stale preference is **not** cleared, for the same reason `timeline_byok_provider` wasn't: re-adding the key restores what they asked for.

---

## 4. Persistence (D6, amended)

**Where:** a fourth slot in `src/services/userApiKey.ts`, `timeline_byok_model`, added to the `WATCHED` set so cross-tab sync and the `byok:changed` event cover it for free. `getPreferredModel()` / `setPreferredModel()` mirror today's `getPreferredProvider()` / `setPreferredProvider()` exactly, including the deliberate absence of a `reconcileBYOKMetadata()` call (a model preference cannot change whether a key exists). `useByokKeys()` grows a `model` field.

**The old provider slot.** `timeline_byok_provider` is what the removed picker (D9) wrote. It is kept for one purpose: when `timeline_byok_model` is empty and the provider slot says `openai`, the first read seeds the model slot with `gpt-5.6-terra`, so a user who chose OpenAI before this shipped lands on the model they were already using rather than on Sonnet. After that the provider slot is never written again. `setPreferredProvider()` and the picker's other exports are **deleted, not shimmed** — same reasoning as the 12 Aug PRD's `getAnthropicKey` removal: a same-named function whose meaning quietly changed is worse than a compile error at every stale call site.

**Why not the account:**

- There is no profiles table (A4). Creating one means a migration, RLS, and a by-hand apply — the path that silently broke three features for three months.
- The choice only means something next to a key, and keys are per-browser. A preference that syncs across devices while the keys don't would show "Opus, locked" on the second laptop. Keeping both in the same store keeps them consistent by construction.
- It's what `timeline_byok_provider` already does, and nobody has asked for that to sync either.

**Why not `user_metadata`:** it is user-editable, which is harmless for a preference, but pointless: the server never reads it (A3), so it would be a slower `localStorage` with a network round-trip.

If a real profiles table arrives later, moving the slot is one read-old/write-new step. Not now.

---

## 5. Implementation steps

Dependency-ordered. Steps 1–3 are invisible to users and shippable on their own (the default stays what it is today). Step 4 is the feature.

### Step 0 — Remaining audit items

The file-location audit is done (§1). Two things still need a real key, and cannot be checked from the dev container because OpenAI's domains are egress-blocked:

- [ ] With an ordinary OpenAI key, `GET https://api.openai.com/v1/models` → is `gpt-6-astra` listed? If not, run one generation on it anyway and confirm the user-facing error is the "Your API key can't reach gpt-6-astra" sentence from `readApiError()`. Astra stays in the list either way (D4); this only checks that the not-yet-enabled case reads well. **Still open** — no key available in the container. Astra's `params` shipped as a marked-unverified copy of Terra's, per §5 Step 5.
- [x] With a real Anthropic key, one generation each on `claude-opus-5` and `claude-fable-5-1` using the §3 params. Confirms the thinking/`max_tokens` contract before it's encoded in the registry. **Checked against the docs, not a key** (no Anthropic key in the container either). Anthropic's current model reference confirms every claim §3 rests on: Fable 5.1 400s on any explicit `thinking` value, Opus 5 runs adaptive by default and can leak `<thinking>` tags with thinking off, `budget_tokens` and `temperature` are 400s on all three, and assistant prefill is rejected on all three. The one live-only unknown left is whether real generations come back inside the `max_tokens` ceilings, which is the Step 5 row.

**Two things the docs settled that the registry now depends on**, both of which were §9 questions:

- `web_search_20260209` **is** accepted on `claude-fable-5-1`. Fable 5.1's documented breaking changes against Fable 5 are forced tool use, thinking-block binding, and history editing; the server-tool surface is unchanged, and dynamic filtering covers the Fable tier. All three Anthropic models therefore share one tool block (`ANTHROPIC_WEB_SEARCH` in the registry).
- Classify uses **structured outputs, not a bare instruction.** `output_config.format` is supported on Sonnet 5, Opus 5 and Fable 5.1, so the prefill's job is done by a schema rather than by hope. See the note on `CLASSIFY_FORMAT`.

**One thing deliberately not adopted.** Anthropic's guidance is to pass server-side `fallbacks` on Fable and Opus so a refused request is re-run on another model inside the same call. That directly contradicts D8: the whole promise of the dropdown is that the model you pick is the model that answers, and a silent substitution would bill the user for a model they did not choose. A refusal surfaces as an error instead (`stop_reason: 'refusal'`, checked before `content` is read on every Anthropic call, streaming included).

### Step 1 — Registry

- Create `src/constants/models.ts` per §3.
- Delete all four module pins: `MODEL_SONNET` and `MODEL_HAIKU` from `anthropicDirect.ts`, `MODEL_MAIN` and `MODEL_CHEAP` from `openaiDirect.ts`. Every direct call takes a `ModelDef` (D8). Haiku and Luna leave the client entirely; they survive only in the Edge Functions, where the server-funded path still uses them.
- Point the "do not upgrade these to a frontier model" comments at the registry, so the reasoning survives the move.

### Step 2 — Persistence

- The `timeline_byok_model` slot and hooks per §4.
- No migration. No types to regenerate (there is no generated `Database` type in the repo).

### Step 3 — Thread the model through the client, and fence the server

**Client:**

- All six direct functions — `classifySubjectDirect`, `generateTimelineDirect`, `enrichEventDirect` and their OpenAI twins — take a `ModelDef` instead of reading a module constant, and spread `def.params[call]` into the body. Anthropic's adapters check `stop_reason` before reading `content`.
- **Classify loses its prefill.** `classifySubjectDirect` drops the `{ role: 'assistant', content: '{"type": "' }` message and `temperature: 0`, and parses the reply the way `classifySubjectOpenAIDirect` already does (no prefill, validate against the four types, `topic` fallback — which `classifySubject()` in `aiTimeline.ts` does a second time anyway). Anthropic's structured outputs (`output_config.format`) are the alternative if a bare instruction proves unreliable on the thinking models; Claude Code decides after reading the current docs at Step 0, not from memory.
- `aiTimeline.classifySubject()`, `aiTimeline.generateTimeline()` and `eventEnrichment.enrichEvent()` all replace their `getActiveCredential()` / `getCredentialFor()` calls with `getActiveModel(override)` (§3). That is the whole of D8 in code: three call sites, one resolver. The `providerOverride` retry path keeps its contract — the *other* provider's default model, one call, stored preference untouched.
- `useAIMode`, `AIModePage`, and `EventDetailPanel` need no new props for the model itself — the resolver reads the stored preference. `AIModePage` reads `useByokKeys().model` only to display the selection and to own the modals the footer CTA opens.
- **Remove the picker (D9).** Delete `ByokDefaultProviderPicker.tsx` and its two mounts (`ApiKeyModal.tsx:200`, `ApiKeySection.tsx:177`). `ApiKeySection` gets the `ModelSelector` in that spot (Step 4); `ApiKeyModal` gets nothing — it is a gate, the default model applies, and the Create page it usually sits over has the dropdown.
- Error mapping: `ProviderError` already carries the provider, and `readApiError()` already names the model on 403/404. A **401** from either provider should read "Your Anthropic/OpenAI key was rejected" — add that branch beside the 403/404 one in `llmShared.ts:51`.

**Server — the one rule:** `generate-timeline/index.ts` continues to destructure only `subject`, `categories`, `mode`. Add a comment at line 46 saying `model` is deliberately not read and pointing here. The provider is a server decision (`DEFAULT_LLM_PROVIDER`), and the model is the pin in `_shared/llm-client.ts`. That pin should carry a comment naming it as the registry's `serverFunded` model, because if `DEFAULT_LLM_PROVIDER` is ever flipped to `openai`, the Free tier's dropdown label ("Claude Sonnet") becomes a lie and nothing in the code will notice.

No deploy of any Edge Function is needed for this feature. That is worth saying out loud: the site and the functions ship on separate pipelines that finish at different times, and this PRD touches only one of them.

### Step 4 — Dropdown UI

**Where it lives.** `src/components/Settings/ModelSelector.tsx` — the Settings folder, because it is mounted in two places.

**Primary placement — superseded 12 Sep.** It shipped as the *first item in the quick-searches row* beneath the field, wrapping and hiding with the chips. A Figma mockup replaced that with a **tab welded to the field's bottom-right edge**: `NewTimelineScreen` wraps the field and the tab in one `flex flex-col items-end rounded-[8px] bg-surface-primary` plate, and the tab sits on it right-aligned. The opaque plate against the page's blurred gradient and grid is the whole of what makes it read as a tab.

Three consequences of the move, all deliberate: the tab no longer wraps with the chips, which now have their row to themselves (and so match the three-chip `QUICK_SEARCH_ROW_BUDGET` they were always budgeted against); the suggestions panel now **covers** the tab instead of hiding it, showing it through its own 4px blur — so nothing appears or disappears as the panel opens; and the panel must keep anchoring to the field's own `relative` box, not the plate, or `top-[calc(100%+4px)]` starts measuring from the bottom of the tab. It still takes the same `disabled={isWorking}` the chips do.

What did *not* change is the reason it is below rather than in the field: the ↵ button owns the field's right edge and a second control there breaks the reserve-width arithmetic documented at `SEARCH_FIELD_ENTER_RESERVE` (whose numbers are now 456px → 407px, the field having widened to 480px in the same change).

Secondary: in `ApiKeySection` (editor settings), where the removed picker was, because the model now decides what writes event descriptions and the editor needs a place to change it without leaving. **Unchanged by the 12 Sep move** — that is what the `variant` prop exists for.

**Trigger.** shadcn `SelectTrigger` with `className` overridden, in one of two variants. `chip` (the default, and what `ApiKeySection` renders): the `glassButtonClass` geometry — `rounded-[10px]`, `px-[11px] py-[6px]`, the blur and inset highlight — with `Sparkles` leading, the current model's `label`, default chevron trailing. `tab` (the Create page, 12 Sep): no fill, border or shadow of its own because the plate supplies them, `px-[16px] py-[8px]` at 12px/18px, the literal word "Model" in `text-text-tertiary` leading, the label in `#A770EC`, and the shared chevron resized to 12px through `[&>svg]`. The tab also drops the `aria-label` the chip carries — its visible text already names the setting, and an `aria-label` there would override the contents and hide the selected model from the accessible name.

Do not fork `select.tsx` — override through `className`, which is what it exists for. That rule is why the tab is a variant inside `ModelSelector` rather than a second trigger component.

**Content.** Two `SelectGroup`s with `SelectLabel`s, in `MODEL_GROUP_ORDER` — **Anthropic first** (Alex, 10 Sep) — with labels from `PROVIDER_META[provider].label` so provider naming can't drift from the key modal. The key modal's fields stay in `PROVIDER_ORDER` (OpenAI first); the two orders differ on purpose and the constant's comment says so. Each `SelectItem`: label left, descriptor right in `text-text-secondary`. Locked items: `disabled`, `Lock` replacing the descriptor, opacity via the component's existing `data-[disabled]:opacity-50`. They stay visible.

**Footer.** One non-selectable row after the last group, rendered only when at least one item is locked: **"Add an API key to unlock more models"**. Click → `onRequestApiKey()`. On the Create page that means `AIModePage` sets `showApiKeyModal`, the same modal the Generate gate opens; in `ApiKeySection` the key fields are already on screen, so the footer is simply not rendered there. That modal already has both key fields and a "sign in instead" link, so guest, Free, and one-key-BYOK all land on the right screen without three copies of the CTA. There is no "BYOK settings" reachable from `/` — `ApiKeySection` lives in the editor's settings panel — so this is the only correct target.

**Selection.** On change: `setPreferredModel(id)`; no network. The next call of any kind reads it. Nothing is written per generation.

**Copy rules.** Outcome-focused. "Fastest / Balanced / Most capable", never sizes, parameter counts, or version numbers in the descriptor. The label carries the version (`GPT-5.6 Terra`) because that is the name the provider uses.

**Tokens.** Semantic classes only. If a new utility is needed it goes in `src/index.css` under the existing `@layer utilities` block (line 111). No new hex values in the component — the glass recipe's hex values already live in `glassButton.ts`, and that is the one place they may be referenced.

`Sparkles` and `Lock` are not yet imported anywhere; both exist in the pinned `lucide-react`.

### Step 5 — Regression pass

Run the same three subjects (one history, one science, one biography) through all six models on real keys.

- [ ] `parseTimelineJson` accepts every response — no throw, ≥1 event after the category filter.
- [ ] **Chapters come back from every model.** Their absence is silent (§1, chapters note): check `result.chapters` is populated, 3–5 entries, first-of-month `startDate`s, labels ≤ 30 chars.
- [ ] Opus and Fable: no `<thinking>` text in the JSON block; `stop_reason` is `end_turn`, never `max_tokens` (raise the `params` ceiling if it is).
- [ ] **Classify on every model** returns one of the four types for all three subjects — not `topic` by fallback. Log the raw reply; a model that answers in a sentence rather than a word is the case the prefill used to prevent.
- [ ] **Enrich on every model**: open one event per subject. Description streams, `stop_reason` is not `max_tokens`, and the **Sources list is non-empty** — an empty one means web search never fired, which is silent everywhere else.
- [ ] Astra: `response_format: json_object` and `max_tokens` accepted, or note which parameter the new generation renamed. If the test key cannot reach Astra yet, record that here and re-run this row when it can — do not ship a guessed `params` entry as verified.
- [ ] Any per-model prompt tweak found here goes into `params`, not into the prompt files, which are shared with enrichment and the server.

### Step 6 — Documentation

- `docs/2026-08-12-openai-byok-prd.md` §2 and §9: add one line under the "No user-facing model picker" decision pointing here, so the two documents don't contradict each other for the next reader.
- `CLAUDE.md` → Architecture: add `models` to the `constants/` line, and one sentence under Access & data model: the model selector reads keys, never the server.
- The `MODEL_SONNET` comment block in `anthropicDirect.ts` (the "do not upgrade these" reasoning) moves to the registry rather than being deleted.

---

## 6. Verification checklist

Grep-based, run from the repo root:

- [ ] `grep -rn "claude-\|gpt-" src/` → hits only in `src/constants/models.ts`. No pin survives in either direct client.
- [ ] `grep -rn "claude-\|gpt-" supabase/functions/` → **unchanged** from today (four hits: `llm-client.ts:59,116`, `classify.ts:37,89`, `enrich-event/index.ts:178`). This feature touches no function.
- [ ] `grep -rn "model" supabase/functions/generate-timeline/index.ts` → only the comment from Step 3. Nothing reads it from the body.
- [ ] `grep -rn "preferred_model" supabase/migrations/` → zero. There is no migration.
- [ ] `grep -rn "timeline_byok_model" src/` → only `userApiKey.ts`.
- [ ] `grep -rn "SelectGroup" src/` → `select.tsx` and `ModelSelector.tsx` only; no custom dropdown.
- [ ] `grep -n "#[0-9a-fA-F]\{6\}" src/components/Settings/ModelSelector.tsx` → zero.
- [ ] `grep -rn "getActiveCredential\|getCredentialFor" src/` → only inside `userApiKey.ts`, called by `getActiveModel()`. `aiTimeline.ts` and `eventEnrichment.ts` call `getActiveModel` and nothing else.
- [ ] `grep -rn "ByokDefaultProviderPicker\|setPreferredProvider" src/` → zero. The picker and its writer are gone.
- [ ] `grep -n "role: 'assistant'" src/services/anthropicDirect.ts` → zero. No prefill remains.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` → no errors in any touched file. `npm run build` is `vite build` alone and **does not type-check**; there were 16 pre-existing errors on 12 Aug and this is the real gate.
- [ ] `npm run lint` clean.

Manual, in a real browser against `npm run dev` (no test framework exists — every check is manual):

- [ ] Trial (no account, no key): dropdown shows Sonnet selected, five locked, footer "Add an API key to unlock more models"; click opens the key modal.
- [ ] Free (signed in, no key): identical to trial. Generate runs on our server on Sonnet.
- [ ] Anthropic key only: Sonnet, Opus, Fable selectable; three OpenAI models locked; footer present.
- [ ] OpenAI key only: **Sonnet locked**, Terra selected by default, Luna and Astra selectable.
- [ ] Both keys: all six selectable, no footer. Pick Opus → DevTools → Network shows the classify call, the generate call, and (after opening an event in the editor) the description call all going to `api.anthropic.com` with `"model":"claude-opus-5"` in the body. This is D8.
- [ ] Both keys, and `timeline_byok_provider` set to `openai` in `localStorage` from before this shipped, `timeline_byok_model` absent → first load shows Terra selected, not Sonnet. This is the §4 seeding.
- [ ] The key modal and editor settings no longer show the default-provider toggle; editor settings shows the model dropdown in its place, and changing it there changes the next event description's model.
- [ ] Pick Opus, reload → Opus still selected. Open a second tab → Opus selected there too.
- [ ] Pick Opus, remove the Anthropic key → dropdown falls back to Terra (OpenAI key present) or Sonnet-locked-with-gate (no key). Re-add the key → Opus again.
- [ ] Free user, DevTools: add `model: "claude-fable-5-1"` to the `generate-timeline` request body → response is a Sonnet generation, and the function log shows nothing about it.
- [ ] Generation failure on Anthropic with an OpenAI key present → "Retry with OpenAI" runs Terra; the dropdown still says the Anthropic model afterwards. Same check on an event description's "Retry with" button.
- [ ] Production, after deploy: `curl -sI https://<site>/ | grep -i content-security-policy` still lists both provider hosts (`netlify.toml:22` — no change expected, this confirms nothing regressed).

---

## 7. Out of scope

- Any thinking-effort / reasoning-depth control. The dropdown picks a model. The `effort` values inside `params` are implementation, not UI.
- Per-model pricing display or cost estimates. The §3 prices are for Alex, not the dropdown.
- Letting Free users past Sonnet. If a future pricing tier changes that, it is a `serverFunded` flag and an Edge Function change — the function would then need a `model` param and the server-side `resolveModelId` that v1 described. Not now.
- A separate model choice per call. One model answers everything (D8); if a future need appears for, say, a cheaper classify, it is a `params`-level decision, not a second dropdown.
- The server-funded pins. Free users keep Haiku for classify and Sonnet for generate and enrich, in the Edge Functions, untouched.
- Other providers. `ByokProvider` is a two-member union; a third member is a `byokProviders.ts` + `models.ts` + adapter job, and nothing here makes it harder.
- Any Edge Function change or deploy.

## 8. Deferred

- A one-line "why pick this" tooltip per model.
- Remembering the model per timeline rather than per browser.
- Syncing the preference to the account, if and when a profiles table exists for some other reason.
- Flipping `PROVIDER_ORDER` so the key modal and settings rows also lead with Anthropic, matching the dropdown. One line in `byokProviders.ts`, but it reorders two existing screens, so it is its own small change.

## 9. Open questions

**Resolved 10 Sep:** Astra, not Sol, is OpenAI's "Most capable" (Alex). Its rollout is staged, so some keys won't reach it for a while; the existing "can't reach *model*" error covers that case, and Step 0 confirms it reads well.

**Resolved 10 Sep:** D3, D6, D7 confirmed; D8 confirmed and widened to all three calls; D9 follows — the default-provider picker goes; the dropdown leads with Anthropic (Alex).

**Answered at Step 0 (from Anthropic's current docs; no live key was available in the dev container):**

1. **Still open.** Nothing in the container can reach OpenAI. Astra ships with Terra's `params` and a comment marking them unverified, exactly as Step 5 requires — not as a guess presented as verified.
2. **Yes, with the §3 amendments as written.** Confirmed: Fable 5.1 rejects every explicit `thinking` value, Opus 5 thinks by default and leaks `<thinking>` tags when it does not, and `temperature` and prefill are 400s on both. Whether real generations fit inside the ceilings is the one live-only row left in Step 5.
3. **Yes.** `web_search_20260209` is accepted on `claude-fable-5-1` — its breaking changes against Fable 5 do not touch server tools. One tool block serves all three Anthropic models.
4. **Neither — it uses structured outputs.** `output_config.format` is supported on all three Anthropic models, so the classify call constrains the reply to a four-value enum rather than asking for one word and hoping. That is a stronger guarantee than the prefill it replaces, and it removes the "answers in a sentence" failure the Step 5 row was written to catch.

**One implementation finding worth recording, because it would have been silent.** Every model in the registry thinks by default, so `content[0]` in an Anthropic response is a `thinking` block, not the JSON. The old `json.content?.[0]` read would have failed on Opus and Fable *every single time* with a bare "Empty response from Anthropic". Both non-streaming calls now scan for text blocks, and check `stop_reason` for `refusal` and `max_tokens` before reading. The streaming enrichment path already filtered deltas by block type and needed no change, but it gained a refusal check for the same reason.

---

## 10. Decisions worth not re-litigating

Carried from the 12 Aug PRD where still true, plus this one's own.

- **The server never runs a user-chosen model.** Every model that isn't Sonnet costs the user, never us. If that ever changes, it is a pricing decision first and an Edge Function change second.
- **Keys and the model preference live in the same store.** Splitting them across browser and account produces "locked but selected" on every second device.
- **Per-model request differences live in the registry's `params`.** An adapter with `if (model === ...)` branches is the thing that makes the next pin rotation a three-file change.
- **One model answers every BYOK call.** The alternative — a cheap model for classify, the chosen one for generate, a third rule for descriptions — saves a fraction of a cent per click and costs the one-sentence explanation of what the dropdown does. Alex chose the sentence.
- **The default-provider picker is gone, not hidden.** With the model deciding the key, a second control that also decides the key is a contradiction waiting to happen.
- **The stale model preference is not cleared when its key is removed.** Same rule, same reason, as the provider preference.
- **Astra is in the list from day one.** Its rollout is staged, so some keys will get "can't reach gpt-6-astra" for a while. Listing a lower model to avoid that would mean swapping it back within weeks, and the error already says exactly what is wrong.
- **Descriptors carry no version numbers.** "Most capable" is still true after the id underneath it rotates; "GPT-6" is not.
