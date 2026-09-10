# PRD: Model Selector — 10 September 2026

**Project:** Timeline Academy
**Status:** Draft v2 — rewritten against the codebase at `9461ff7` (main, 9 Sep). Draft v1 (8 Sep) was written without a live audit; the audit is now done and is recorded in §1. Nothing has been built yet.

---

## 0. What we're building

A dropdown in the Create flow (`/`) that lets users pick which LLM generates their timeline. Six models across two providers. Anyone without a key for a provider sees that provider's models locked, with the locked rows telling them how to unlock.

**Why:** BYOK users are paying for their own tokens and should get to spend them on the model they want. For everyone else, the locked list is a low-effort upsell that shows what adding a key gets you.

**One sentence to keep in mind:** the dropdown lists what your keys can reach. Nothing in it changes what our server does, because our server never runs a model the user chose.

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
| A8 | `gpt-6-astra` is available | The id is real (`gpt-6-astra`, $10/$50 per MTok) but it began a **staged rollout on 3 Sep** — enterprise Trusted Access first, then "over the coming days" to the API. Not confirmed reachable with an ordinary key as of this writing. `gpt-5.6-sol` ($4/$20 promotional through 21 Nov) is the GA frontier of the 5.6 family. | Blocking open question §9.1. `readApiError()` already turns a 403/404 into "Your API key can't reach *model*", so an unreachable model degrades gracefully — but it shouldn't be the one we advertise as "Most capable". |
| A9 | The event-detail panels might share the generation function | They don't share the function. They share the **constant**: `MODEL_SONNET` in `anthropicDirect.ts:31` and `MODEL_MAIN` in `openaiDirect.ts:36` are read by generation *and* enrichment. Classification uses `MODEL_HAIKU` / `MODEL_CHEAP` with assistant prefill, which Sonnet-tier and above reject. | Generation reads the registry; enrichment and classification keep their pins. The dropdown cannot leak into the panels by construction. Non-blocking question 1 from v1 is answered: no. |
| A10 | "Left of the generate button, matching the floating-toolbar / pill styling" | The Create page has no floating toolbar (that's the editor). The generate button is a blue ↵ **inside** the search field (`NewTimelineScreen.tsx:355`, desktop only, PR #107). The pill on this page is `glassButtonClass` (`src/components/ui/glassButton.ts`), used by the quick-search chips below the field. | Placement in §5 Step 4 rewritten around the actual layout. |
| A11 | Nothing said about it | `docs/2026-08-12-openai-byok-prd.md` §2 and §9 **explicitly reject a user-facing model picker**, listing it under "Decisions worth not re-litigating". | This PRD reverses that on Alex's call. Step 6 amends that doc so the two don't contradict. The cost argument it made is still valid and is carried into §3 as context. |

**About the two PRs merged since v1.** The chapters work (#110–#113, 8–9 Sep) added an optional `chapters` array to the generation response. It is parsed leniently on both paths (`parseChapters` in `src/services/llmShared.ts` and `_shared/llm-client.ts`): a model that omits or malforms chapters produces **no error**, just a timeline with no chapters strip. That is exactly the kind of regression a model switch causes silently, so Step 5 checks chapters per model explicitly. Otherwise those PRs don't touch anything here.

---

## 2. Decisions

Locked, with the audit's amendments marked. Amended rows need Alex's sign-off before Step 4.

| # | Decision | Status |
|---|---|---|
| D1 | UI is a plain dropdown (shadcn `Select` — present at `src/components/ui/select.tsx` with `SelectGroup`, `SelectLabel`, `SelectItem`, `SelectSeparator`). No slider, no thinking-effort control. | Locked |
| D2 | Guest and Free tiers are hard-locked to Claude Sonnet, enforced server-side. | Locked. **Already true**: the Edge Function reads only `subject`, `categories`, `mode` (`generate-timeline/index.ts:46`) and pins Sonnet. Enforcement = keep it that way (Step 3). |
| D3 | Locked models still render in the dropdown, disabled, with a lock icon and an unlock CTA row. | **Amended (A6):** one unlock copy, "Add an API key to unlock more models", for every locked state. No login-specific copy. |
| D4 | Six models, grouped by provider: Anthropic (Sonnet, Opus, Fable) and OpenAI (Luna, Terra, Astra-or-Sol). | Locked, with the sixth id pending §9.1. Group order follows `PROVIDER_ORDER` (`src/constants/byokProviders.ts`: OpenAI, then Anthropic) unless Alex wants the dropdown to differ from the key modal. |
| D5 | A provider's models unlock only with a key for that provider. | Locked. **Extends to Sonnet** (A5). |
| D6 | The chosen model is remembered. | **Amended (A4):** `localStorage` slot `timeline_byok_model`, same pattern as `timeline_byok_provider`. No profile column, no migration. Rationale in §4. |
| D7 | Default is Claude Sonnet. | **Amended (A5):** default is the provider's current pin — Sonnet for Anthropic, Terra for OpenAI — which is exactly what every existing user gets today. Nobody's generation changes model until they open the dropdown. |
| D8 *(new)* | The chosen model's provider decides which key the **whole Create flow** uses — classification and generation together. | Proposed. Without this, a user with both keys and preferred-provider OpenAI who picks Opus would bill OpenAI for the classify call and Anthropic for the generate call in one click. The 12 Aug PRD's own rule: spending on an account the user didn't pick for this request is a surprise. |
| D9 *(new)* | The default-provider picker stays. It keeps governing event enrichment, which this PRD does not touch. | Proposed. See §9.3 for the alternative. |

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
| OpenAI | GPT-6 Astra *(or GPT-5.6 Sol, §9.1)* | Most capable | `gpt-6-astra` *(or `gpt-5.6-sol`, $4 → $20)* | $10 → $50 | OpenAI key |

Ids verified 10 Sep: the three Anthropic ids against Anthropic's current model list; `gpt-5.6-luna` and `gpt-5.6-terra` are already pinned in the code and were confirmed against OpenAI's pricing page; `gpt-6-astra` and `gpt-5.6-sol` against OpenAI's announcement and pricing pages. **Model ids are complete as written — never append date suffixes.**

Prices are context for Alex, not UI (out of scope, §7). The point the 12 Aug PRD made still stands: this workload is bounded JSON. A generation on Sonnet costs roughly $0.02; the same generation on Fable or Astra costs roughly five times that, on the user's own account, for a difference they may not be able to see. That is the user's call to make now, and the "Fastest / Balanced / Most capable" descriptors are deliberately version-free so the dropdown copy survives the next id rotation.

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
  /** Per-model request-body overrides. See "Why params is not optional". */
  params: AnthropicParams | OpenAIParams
}

export const DEFAULT_MODEL_BY_PROVIDER: Record<ByokProvider, string> = {
  anthropic: 'claude-sonnet-5',   // today's MODEL_SONNET
  openai: 'gpt-5.6-terra',        // today's MODEL_MAIN
}

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

The OpenAI side has fewer known hazards: all three run through Chat Completions with `response_format: { type: 'json_object' }` and `max_tokens: 8192`, no `temperature` (already removed for the reasoning-capable family). Astra/Sol's parameter contract is unverified — OpenAI's docs are egress-blocked from the dev container, same as on 12 Aug. Step 5 is where it gets checked.

Rule: **every per-model difference lives in `params`. The adapters apply `{ model: def.id, ...def.params }` and contain no per-model branches.** A future pin change is then a registry edit, not an adapter edit.

### Helpers

```ts
export type LockReason = 'anthropic_key' | 'openai_key'

/** Every model, with whether this visitor can select it and why not. */
export function getModelAvailability(
  tier: AccountTier,                                  // from useAccountTier()
  keys: { anthropic: boolean; openai: boolean },      // from useByokKeys()
): Array<{ model: ModelDef; locked: boolean; lockReason?: LockReason }>

/** The requested id if this visitor may use it, else their provider default. */
export function resolveModelId(
  requested: string | null,
  tier: AccountTier,
  keys: { anthropic: boolean; openai: boolean },
): string
```

Availability logic, in words:

- `trial` or `free` (no key): only the `serverFunded` model is unlocked. Everything else is locked; the reason is the provider's key.
- `byok-anon` or `byok`: a model is unlocked iff `keys[model.provider]`. Sonnet included (A5).
- `loading`: the hook returns nothing selectable; the dropdown renders its trigger disabled. Same rule `useAccountTier` already imposes on every consumer (`CLAUDE.md` → Access & data model).

Fallback logic for `resolveModelId`, mirroring the load-bearing "exactly one key wins" branch in `resolveActive()`:

1. Requested id exists and is unlocked → return it.
2. Otherwise → `DEFAULT_MODEL_BY_PROVIDER[p]` where `p` is the active credential's provider (`getActiveCredential()`), or `anthropic` when there is no key (the server path).

So a user who saved Opus, then removes their Anthropic key, silently generates on Terra if they have an OpenAI key, and is gated to sign-in-or-key if they have neither — exactly what happens to them today. The stale preference is **not** cleared, for the same reason `timeline_byok_provider` isn't: re-adding the key restores what they asked for.

---

## 4. Persistence (D6, amended)

**Where:** a fourth slot in `src/services/userApiKey.ts`, `timeline_byok_model`, added to the `WATCHED` set so cross-tab sync and the `byok:changed` event cover it for free. `getPreferredModel()` / `setPreferredModel()` mirror `getPreferredProvider()` / `setPreferredProvider()` exactly, including the deliberate absence of a `reconcileBYOKMetadata()` call (a model preference cannot change whether a key exists). `useByokKeys()` grows a `model` field.

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

- [ ] With an ordinary OpenAI key, `GET https://api.openai.com/v1/models` → is `gpt-6-astra` listed? Decides §9.1.
- [ ] With a real Anthropic key, one generation each on `claude-opus-5` and `claude-fable-5-1` using the §3 params. Confirms the thinking/`max_tokens` contract before it's encoded in the registry.

### Step 1 — Registry

- Create `src/constants/models.ts` per §3.
- Delete `MODEL_SONNET` from `anthropicDirect.ts` and `MODEL_MAIN` from `openaiDirect.ts` **for generation only**. Enrichment keeps a local pin (rename it `ENRICH_MODEL` so a grep for the generation constant finds nothing). Classification keeps `MODEL_HAIKU` / `MODEL_CHEAP` untouched — those calls use assistant prefill, which only Haiku supports (A9).
- Point the "do not upgrade these to a frontier model" comments at the registry, so the reasoning survives the move.

### Step 2 — Persistence

- The `timeline_byok_model` slot and hooks per §4.
- No migration. No types to regenerate (there is no generated `Database` type in the repo).

### Step 3 — Thread the model through the client, and fence the server

**Client:**

- `generateTimelineDirect()` and `generateTimelineOpenAIDirect()` take a `ModelDef` instead of reading a module constant, and spread `def.params` into the body. Anthropic's adapter checks `stop_reason` before reading `content`.
- `aiTimeline.generateTimeline()` and `classifySubject()` take `model: ModelDef`. `resolveCredential()` becomes `getCredentialFor(model.provider)` — the model decides the key (D8). The `providerOverride` retry path stays: a retry against the *other* provider runs that provider's `DEFAULT_MODEL_BY_PROVIDER` entry and, like today, does not change the stored preference.
- `useAIMode.classifyAndGenerate()` and `AIModePage.runGeneration()` pass the model along. `AIModePage` owns the selected id (read via `useByokKeys().model` → `resolveModelId`), because it already owns the two modals the footer CTA opens.
- Error mapping: `ProviderError` already carries the provider, and `readApiError()` already names the model on 403/404. A **401** from either provider should read "Your Anthropic/OpenAI key was rejected" — add that branch beside the 403/404 one in `llmShared.ts:51`.

**Server — the one rule:** `generate-timeline/index.ts` continues to destructure only `subject`, `categories`, `mode`. Add a comment at line 46 saying `model` is deliberately not read and pointing here. The provider is a server decision (`DEFAULT_LLM_PROVIDER`), and the model is the pin in `_shared/llm-client.ts`. That pin should carry a comment naming it as the registry's `serverFunded` model, because if `DEFAULT_LLM_PROVIDER` is ever flipped to `openai`, the Free tier's dropdown label ("Claude Sonnet") becomes a lie and nothing in the code will notice.

No deploy of any Edge Function is needed for this feature. That is worth saying out loud: the site and the functions ship on separate pipelines that finish at different times, and this PRD touches only one of them.

### Step 4 — Dropdown UI

**Where it lives.** `src/components/NewTimeline/ModelSelector.tsx`, rendered by `NewTimelineScreen` as the **first item in the quick-searches row** beneath the field (`NewTimelineScreen.tsx:408`, the `role="group"` flex-wrap row), so it wraps with the chips on narrow screens and disappears with them under the suggestions panel. It takes the same `disabled={isWorking}` the chips do. Not inside the field: the ↵ button already owns the field's right edge and a second control there breaks the reserve-width arithmetic documented at lines 58–66.

**Trigger.** shadcn `SelectTrigger` with `className` overridden to the `glassButtonClass` geometry (`rounded-[10px]`, `px-[11px] py-[6px]`, the blur and inset highlight). Content: `Sparkles` leading, the current model's `label` only, default chevron trailing. Do not fork `select.tsx` — override through `className`, which is what it exists for.

**Content.** Two `SelectGroup`s with `SelectLabel`s, in `PROVIDER_ORDER`, labels from `PROVIDER_META[provider].label` so provider naming can't drift from the key modal. Each `SelectItem`: label left, descriptor right in `text-text-secondary`. Locked items: `disabled`, `Lock` replacing the descriptor, opacity via the component's existing `data-[disabled]:opacity-50`. They stay visible.

**Footer.** One non-selectable row after the last group, rendered only when at least one item is locked: **"Add an API key to unlock more models"**. Click → `onRequestApiKey()` → `AIModePage` sets `showApiKeyModal`, the same modal the Generate gate opens. That modal already has both key fields and a "sign in instead" link, so guest, Free, and one-key-BYOK all land on the right screen without three copies of the CTA. There is no "BYOK settings" reachable from `/` — `ApiKeySection` lives in the editor's settings panel — so this is the only correct target.

**Selection.** On change: `setPreferredModel(id)`; no network. The next Generate reads it. Nothing is written per generation.

**Copy rules.** Outcome-focused. "Fastest / Balanced / Most capable", never sizes, parameter counts, or version numbers in the descriptor. The label carries the version (`GPT-5.6 Terra`) because that is the name the provider uses.

**Tokens.** Semantic classes only. If a new utility is needed it goes in `src/index.css` under the existing `@layer utilities` block (line 111). No new hex values in the component — the glass recipe's hex values already live in `glassButton.ts`, and that is the one place they may be referenced.

`Sparkles` and `Lock` are not yet imported anywhere; both exist in the pinned `lucide-react`.

### Step 5 — Regression pass

Run the same three subjects (one history, one science, one biography) through all six models on real keys.

- [ ] `parseTimelineJson` accepts every response — no throw, ≥1 event after the category filter.
- [ ] **Chapters come back from every model.** Their absence is silent (§1, chapters note): check `result.chapters` is populated, 3–5 entries, first-of-month `startDate`s, labels ≤ 30 chars.
- [ ] Opus and Fable: no `<thinking>` text in the JSON block; `stop_reason` is `end_turn`, never `max_tokens` (raise the `params` ceiling if it is).
- [ ] Astra/Sol: `response_format: json_object` and `max_tokens` accepted, or note which parameter the family renamed.
- [ ] Any per-model prompt tweak found here goes into `params`, not into the prompt files, which are shared with enrichment and the server.

### Step 6 — Documentation

- `docs/2026-08-12-openai-byok-prd.md` §2 and §9: add one line under the "No user-facing model picker" decision pointing here, so the two documents don't contradict each other for the next reader.
- `CLAUDE.md` → Architecture: add `models` to the `constants/` line, and one sentence under Access & data model: the model selector reads keys, never the server.
- The `MODEL_SONNET` comment block in `anthropicDirect.ts` (the "do not upgrade these" reasoning) moves to the registry rather than being deleted.

---

## 6. Verification checklist

Grep-based, run from the repo root:

- [ ] `grep -rn "claude-sonnet\|claude-opus\|claude-fable\|gpt-" src/` → hits only in `src/constants/models.ts` plus the enrichment and classification pins (`ENRICH_MODEL`, `MODEL_HAIKU`, `MODEL_CHEAP`), each with a comment saying why it is not in the registry.
- [ ] `grep -rn "claude-\|gpt-" supabase/functions/` → **unchanged** from today (four hits: `llm-client.ts:59,116`, `classify.ts:37,89`, `enrich-event/index.ts:178`). This feature touches no function.
- [ ] `grep -rn "model" supabase/functions/generate-timeline/index.ts` → only the comment from Step 3. Nothing reads it from the body.
- [ ] `grep -rn "preferred_model" supabase/migrations/` → zero. There is no migration.
- [ ] `grep -rn "timeline_byok_model" src/` → only `userApiKey.ts`.
- [ ] `grep -rn "SelectGroup" src/` → `select.tsx` and `ModelSelector.tsx` only; no custom dropdown.
- [ ] `grep -n "#[0-9a-fA-F]\{6\}" src/components/NewTimeline/ModelSelector.tsx` → zero.
- [ ] `grep -rn "getCredentialFor\|getActiveCredential" src/services/aiTimeline.ts` → generation resolves by `model.provider`, not by the stored provider preference.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` → no errors in any touched file. `npm run build` is `vite build` alone and **does not type-check**; there were 16 pre-existing errors on 12 Aug and this is the real gate.
- [ ] `npm run lint` clean.

Manual, in a real browser against `npm run dev` (no test framework exists — every check is manual):

- [ ] Trial (no account, no key): dropdown shows Sonnet selected, five locked, footer "Add an API key to unlock more models"; click opens the key modal.
- [ ] Free (signed in, no key): identical to trial. Generate runs on our server on Sonnet.
- [ ] Anthropic key only: Sonnet, Opus, Fable selectable; three OpenAI models locked; footer present.
- [ ] OpenAI key only: **Sonnet locked**, Terra selected by default, Luna and Astra/Sol selectable.
- [ ] Both keys: all six selectable, no footer. Pick Opus with preferred-provider set to OpenAI → the classify *and* generate calls both go to `api.anthropic.com` (DevTools → Network). This is D8.
- [ ] Pick Opus, reload → Opus still selected. Open a second tab → Opus selected there too.
- [ ] Pick Opus, remove the Anthropic key → dropdown falls back to Terra (OpenAI key present) or Sonnet-locked-with-gate (no key). Re-add the key → Opus again.
- [ ] Free user, DevTools: add `model: "claude-fable-5-1"` to the `generate-timeline` request body → response is a Sonnet generation, and the function log shows nothing about it.
- [ ] Generation failure on Anthropic with an OpenAI key present → "Retry with OpenAI" runs Terra; the dropdown still says the Anthropic model afterwards.
- [ ] Production, after deploy: `curl -sI https://<site>/ | grep -i content-security-policy` still lists both provider hosts (`netlify.toml:22` — no change expected, this confirms nothing regressed).

---

## 7. Out of scope

- Any thinking-effort / reasoning-depth control. The dropdown picks a model. The `effort` values inside `params` are implementation, not UI.
- Per-model pricing display or cost estimates. The §3 prices are for Alex, not the dropdown.
- Letting Free users past Sonnet. If a future pricing tier changes that, it is a `serverFunded` flag and an Edge Function change — the function would then need a `model` param and the server-side `resolveModelId` that v1 described. Not now.
- Model choice for event enrichment. It keeps its own pin (A9) and follows the default-provider picker (D9).
- Model choice for classification, independent of generation. It follows the generation model's provider and runs that provider's cheap pin (D8).
- Other providers. `ByokProvider` is a two-member union; a third member is a `byokProviders.ts` + `models.ts` + adapter job, and nothing here makes it harder.
- Any Edge Function change or deploy.

## 8. Deferred

- A one-line "why pick this" tooltip per model.
- Remembering the model per timeline rather than per browser.
- Syncing the preference to the account, if and when a profiles table exists for some other reason.
- Updating the `ByokDefaultProviderPicker` helper text to say it now governs enrichment only (see §9.3 — depends on the answer).

## 9. Open questions

**Blocking — answer before Step 1:**

1. **Alex — Astra or Sol as OpenAI's "Most capable"?** `gpt-6-astra` may not be reachable from an ordinary key yet (A8). Options: (a) ship Sol now, swap the id to Astra when Step 0 confirms it's GA — one registry line; (b) ship Astra and rely on the existing "Your API key can't reach gpt-6-astra" error for users who aren't in the rollout yet. Recommendation: (a). A locked-looking row that is actually just broken for most people is the wrong first impression for the model we call "Most capable".

**Blocking — answer before Step 4:**

2. **Alex — confirm the amended decisions D3, D6, D7 and the new D8.** Each is a consequence of the code, not a preference, but they change what v1 said and should not be silently adopted.

**Non-blocking:**

3. **Alex — does the model selector replace the default-provider picker?** With the dropdown choosing the generation key (D8), the picker's remaining job is event enrichment. Keeping it (D9) means two controls that both say "which account gets billed", for different actions. Replacing it means enrichment follows the generation model's provider, and the picker component and its `timeline_byok_provider` slot go away — but the slot cannot simply be deleted (it is read by `resolveActive()` for every BYOK user today), so that is a small read-old/write-new step. Recommendation for v1: keep both; revisit once there is a second thing the dropdown could govern.
4. **Alex — group order.** D4 lists Anthropic first; `PROVIDER_ORDER` lists OpenAI first everywhere both providers are shown today. Using `PROVIDER_ORDER` keeps the dropdown and the key modal in the same order. Default: follow `PROVIDER_ORDER`.
5. **Claude Code, at Step 0** — is `gpt-6-astra` listed for an ordinary key, and do Opus 5 / Fable 5.1 accept the §3 params unchanged?

---

## 10. Decisions worth not re-litigating

Carried from the 12 Aug PRD where still true, plus this one's own.

- **The server never runs a user-chosen model.** Every model that isn't Sonnet costs the user, never us. If that ever changes, it is a pricing decision first and an Edge Function change second.
- **Keys and the model preference live in the same store.** Splitting them across browser and account produces "locked but selected" on every second device.
- **Per-model request differences live in the registry's `params`.** An adapter with `if (model === ...)` branches is the thing that makes the next pin rotation a three-file change.
- **Classification stays on Haiku and Luna.** Assistant prefill only works there, and the user cannot see that call anyway.
- **Enrichment does not follow the dropdown.** It is the most expensive call in the product (web search, up to three per event) and the dropdown says "generates your timeline". Changing what it bills should be its own decision.
- **The stale model preference is not cleared when its key is removed.** Same rule, same reason, as the provider preference.
- **Descriptors carry no version numbers.** "Most capable" is still true after the id underneath it rotates; "GPT-6" is not.
