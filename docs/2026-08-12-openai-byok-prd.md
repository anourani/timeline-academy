# OpenAI as a second BYOK provider — 12 August 2026

Product requirements and implementation record for adding OpenAI alongside Anthropic in bring-your-own-key mode, collapsing the key-entry modal to a single screen, and refreshing model pins that had fallen a generation behind on both providers. Written alongside the change rather than after it, so the "verified vs. unverified" split in section 7 is the honest state at merge time, not an aspiration.

---

## 1. Summary

Timeline Academy's AI ran on Anthropic only. A visitor who wanted to generate without an account had to paste an Anthropic key, and the key-entry flow cost two screens: a "Generate with AI" modal offering **Add Anthropic key** / **Sign in instead**, then a second screen with the `sk-ant-…` input hidden behind a Back button.

Two problems. Anthropic being the only option excluded anyone who already had an OpenAI account and no reason to open an Anthropic one. And the extra click hid the actual ask behind a button that only restated it.

What shipped:

- **OpenAI is a first-class BYOK provider**, with the same three capabilities as Anthropic: timeline generation, subject classification, and event enrichment with live web search feeding the Sources list.
- **The modal is one screen.** Both key fields are visible on open. Either key alone is sufficient. When both are present, a default-provider picker appears.
- **Model pins are current on both providers**, and the three Sonnet 5 breaking changes that refresh triggered are handled.
- **Two cost-honesty changes**: the modal no longer describes BYOK as "free", and Regenerate now confirms before spending.

The tier model is unchanged. `byok_enabled` is still a boolean, no provider is recorded server-side, and **no migration or SQL change was needed** — which is the main reason this landed without touching the part of the system that has historically drifted.

---

## 2. Product decisions

| Decision | Choice | Why |
|---|---|---|
| Modal layout | One screen, both inputs visible | The reveal step restated the ask instead of advancing it |
| Both keys saved | Explicit default-provider picker | Users should be able to see and choose which account gets billed |
| Sign-in affordance | Demoted to a text link | Keys are the primary path in this modal; sign-in is the alternative |
| Tier treatment | Any key grants `byok` / `byok-anon` identically | Limits do not vary by provider, so provider is not an axis |
| Enrichment | Full parity — OpenAI web search feeds the same Sources list | A description without sources is a materially worse product |
| Provider failure | No silent failover; an explicit "Retry with «other»" action | Spending on an account the user did not pick for this request is a surprise, and auto-retry hides a broken key |
| Model selection | App-controlled, no UI | Model IDs go stale; a user-facing dropdown becomes wrong within months and asks students to make a choice they have no basis for |
| Cost disclosure | Qualitative, no figures | Numbers drift with provider pricing and vary by timeline size |

**Rejected: a user-facing model picker.** The API key is an authentication credential; the model is a per-request parameter. The app already chose per task — a capable model for generation and enrichment, a cheap one for classification — and that split is not a judgement a user can make better, since they cannot see which call is a one-word classification.

---

## 3. The CORS question — unresolved, and it gates the transport

Anthropic supports browser-direct calls deliberately: `anthropicDirect.ts:32` sends `anthropic-dangerous-direct-browser-access: true`, which is Anthropic's explicit opt-in for exactly this use case.

**OpenAI publishes no equivalent.** Whether `api.openai.com` returns permissive CORS headers to browser-origin requests is a property of their policy, not something the client can assert. Public evidence is genuinely split: browser-based bring-your-own-key apps exist and appear to work, and there are also many developer reports of browser-origin requests failing while identical server-side calls succeed.

**This was not verified.** The development container's egress proxy returns 403 on CONNECT to `api.openai.com` and blocks OpenAI's documentation domains, so neither a live call nor an authoritative doc read was possible. The implementation assumes browser-direct works, because that is the outcome that preserves the existing privacy property.

Before trusting the OpenAI path, run this from the browser console on a page served by `npm run dev`, then read DevTools → Network:

```js
fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + key } })
```

`curl` cannot answer this. CORS is a browser-only mechanism, and `curl` succeeds against endpoints browsers refuse to call — the same distinction that cost hours during the August 2025 outage.

**If it is blocked**, the OpenAI path needs a pass-through edge function that forwards the key without storing or logging it, and three things become mandatory rather than optional: the modal's OpenAI helper text must say the key transits our server, `PrivacyPolicyPage.tsx` must say the same, and the relay must never log the key or the provider error body — `2026-08-05-security-review-handoff.md` §2 records that relaying provider error bodies verbatim was already fixed once.

---

## 4. What changed

**New modules.** `src/types/ai.ts` holds the provider-neutral types. `src/services/llmShared.ts` holds `parseTimelineJson`, `stripCodeFence`, `readApiError`, `readSseStream` and `ProviderError`. `src/services/openaiDirect.ts` mirrors `anthropicDirect.ts`. `src/constants/byokProviders.ts` holds the display metadata every surface reads from, so provider naming cannot drift. `src/components/Settings/ByokDefaultProviderPicker.tsx` is one component mounted in two places over one persisted value.

Extracting the shared core first was not tidiness. `anthropicDirect.ts` imported `EnrichmentStreamHandlers` from `eventEnrichment.ts`, which imported `enrichEventDirect` back — a type-only cycle that was harmless with one provider and would not have been with two.

**Storage.** `src/services/userApiKey.ts` was rewritten around three slots. `timeline_byok_anthropic_key` keeps its exact name: renaming it is silent data loss for every existing BYOK user, with no error and no migration path. The old `getAnthropicKey` / `setAnthropicKey` / `clearAnthropicKey` / `useAnthropicKey` exports were **deleted rather than shimmed** — their meaning shifts subtly from "the Anthropic key" to "the key in use", and a same-named shim would let a stale call site compile while reading the wrong slot. The compiler found all seven importers.

The resolution rule in `getActiveCredential()` has one branch that is load-bearing rather than an optimisation: **when exactly one key exists it wins, regardless of a stale preference.** Without it, a user whose preference says `openai` who then removes their OpenAI key reads as `byok` to the tier logic (a key exists) and as "no key" to the routing logic — a split brain surfacing as a sign-in gate they should never see.

The cross-tab `storage` listener now watches all three slots and handles `e.key === null`, which is what another tab's `localStorage.clear()` produces and which the old single-key filter silently dropped.

**Routing.** `aiTimeline.ts` and `eventEnrichment.ts` branch on the resolved credential and accept an optional `providerOverride` for the retry action. The override deliberately does not change the stored default, so a one-off retry never silently redefines which provider a user is on.

**CSP.** `netlify.toml` gained `https://api.openai.com` in `connect-src`.

---

## 5. Refreshing the model pins, and the three things that broke

Both providers were a generation behind: the client pinned `claude-sonnet-4-6` and `claude-haiku-4-5-20251001`, the edge functions pinned `gpt-4o` and `gpt-4o-mini`. Current pins and list prices:

| Role | Was | Now | $/MTok in → out |
|---|---|---|---|
| Anthropic capable | `claude-sonnet-4-6` | `claude-sonnet-5` | $3 → $15 |
| Anthropic cheap | `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | $1 → $5 |
| OpenAI capable | `gpt-4o` | `gpt-5.6-terra` | $2 → $12 |
| OpenAI cheap | `gpt-4o-mini` | `gpt-5.6-luna` | $0.20 → $1.20 |

All four are deliberately mid- or budget-tier. `claude-fable-5` ($10/$50) and `gpt-5.6-sol` ($5/$30) cost several times as much for bounded JSON generation and short prose, and on BYOK that spend lands on the user's own account. **The reasoning is in a comment beside each constant**, because "upgrade to the better model" looks like an obvious improvement to anyone who has not thought about the workload.

Moving to `claude-sonnet-5` broke three things, each of which fails only at runtime:

1. **Non-default `temperature` returns a 400.** `anthropicDirect.ts` set `temperature: 0.4` on generation and `_shared/llm-client.ts` did the same. The second one is the default server-funded path — left in place, it would have broken generation for every free-tier user on the first request after deploy. Both removed.
2. **Adaptive thinking is now on by default**, where Sonnet 4.6 ran thinking-off when `thinking` was omitted, and `max_tokens` caps thinking *plus* response text. The two calls resolve this in opposite directions on purpose. Generation sets `thinking: {type: 'disabled'}` — it emits a fixed JSON schema with no tools, so there is nothing for reasoning to improve. Enrichment leaves thinking on and raises `max_tokens` from 1024 to 4096, because with thinking off Sonnet 5 reaches for tools noticeably less often, and an enrichment where `web_search` never fires produces a description with an empty Sources list and no error anywhere.
3. **Assistant prefill returns a 400 on Sonnet-tier models.** Both prefill sites turned out to run on Haiku 4.5 — `classifySubjectDirect` and `_shared/classify.ts` — which still supports it. No change needed, but the constraint is now commented at both sites so a future pin change does not silently break them.

The web-search tool was upgraded from `web_search_20250305` to `web_search_20260209` on both enrichment paths. The newer variant filters results before they enter the context window, which lands directly on the most expensive call in the product.

---

## 6. What actually drives the AI bill

Worth recording, because the intuition that "the app picks the model, so the app could pick something ruinous" points at the wrong risk.

**Enrichment results are cached, and the guard is solid.** `EventDetailPanel.tsx:28-30` checks `Boolean(event?.description)` before every call and short-circuits when one exists. The result persists on all three storage paths — Supabase `events.description` for signed-in users, localStorage drafts for logged-out, and a per-browser cache for public viewers — and `timelineFingerprint.ts:104` includes `description`, so the write actually arms. A user pays once per event, not once per open. There is no batching anywhere: `enrichEvent` has exactly one call site, reachable only by a deliberate click.

**Per-unit costs** on Sonnet 5: classification is a fraction of a cent, generation is roughly $0.02, and each event opened is roughly $0.06 — dominated by up to three web searches at $10 per 1,000, not by tokens. Exploring a thirty-event timeline end to end lands near $2, once.

**The real exposures are not model choice**, and three of the four are unchanged by this work:

- **BYOK has no client-side rate limiting.** `_shared/rate-limiter.ts` is Deno code the browser never imports, and `eventEnrichment.ts` returns before it. The 5/day and 30/day caps protect Timeline Academy's budget, not the user's.
- **Aborted enrichments bill but do not persist.** `EventDetailPanel.tsx` bails on `ctrl.signal.aborted` inside `onDone`, so closing the panel mid-stream discards work the provider already charged for, and reopening starts a fresh call.
- **Regenerate was uncapped** — no confirmation, no counter. **Fixed here**: the footer button now confirms, and the message says a new billed call including a fresh web search will run. The error-state "Try again" deliberately does *not* confirm, because recovering from a failure is not accidental repeat spend.
- **The only cost-adjacent copy in the product called it free.** `ApiKeyModal.tsx` said BYOK was "free, no rate limits" — true of *our* limits, and read by users as free. **Fixed here.**

---

## 7. Verified vs. unverified

Following the convention in `2026-08-07-verification-runbook.md`: shipped is not the same as verified.

**Verified in a real browser** against `npm run dev`, driven by Playwright:

- The modal renders one screen with both fields visible, no Back button, no reveal step.
- Empty submit produces the form-level error; the modal stays open.
- Pasting an `sk-ant-…` key into the OpenAI field produces an error naming the mix-up, and clears as soon as the field is corrected.
- The default-provider picker appears live while the second key is typed, not only after a save.
- Saving both keys writes all three localStorage slots correctly.
- **Back-compat**: a pre-existing `timeline_byok_anthropic_key` alone still promotes the visitor out of trial, and the slot is untouched.
- **Cross-tab**: a write to the OpenAI or preference slot in one tab is observed by another, and `localStorage.clear()` in one tab is observed by the other.
- No clipping at a 600px viewport height.

**Verified by the compiler**: `tsc --noEmit` reports no errors in any file this change touched, and `eslint` is clean.

**NOT verified — do these before trusting the feature:**

1. **The CORS question in section 3.** Everything about the OpenAI transport rests on it.
2. **Every OpenAI request and stream-event shape.** The Responses API request body, the `response.output_text.delta` / `response.output_text.annotation.added` / `response.completed` event names, and the `url_citation` annotation fields all come from secondary sources, because OpenAI's documentation domains are egress-blocked from the development container. Capture one real SSE transcript and reconcile before relying on the Sources list.
3. **The GPT-5.6 parameter contract.** Whether `max_tokens`, `response_format` and the absence of `temperature` are correct for that family is unconfirmed. `temperature` was removed defensively on the OpenAI paths, which is the safe direction: if the model accepts it, the cost is slightly more output variance; if it rejects it, keeping it would 400 every request.
4. **Anthropic generation after the pin refresh.** The `temperature` removal and the thinking/`max_tokens` interaction are both silent-until-production. Run one generation and one enrichment on a real Anthropic key.
5. **Production CSP.** `curl -sI https://<site>/ | grep -i content-security-policy` and confirm `api.openai.com` is present, then run one real OpenAI enrichment against production.

**A gap worth knowing about**: `npm run build` is `vite build` alone and does **not** type-check. There are 16 pre-existing TypeScript errors in the repository that ship silently as a result. `npx tsc --noEmit -p tsconfig.app.json` is the real gate; none of the 16 are in files this change touched.

---

## 8. Open items

- Persist partial descriptions when an enrichment is aborted, so impatient clicking does not re-bill. Needs care: a partial description must not be stored as if it were complete.
- `UsageLimits.tsx` shows BYOK events as "Unlimited" with an infinity glyph while `plans.ts` caps them at 1200 and `useAIMode.ts` enforces it.
- Server-side provider selection is inconsistent: `generate-timeline/index.ts` reads `DEFAULT_LLM_PROVIDER`, while `_shared/classify.ts` picks by key presence.
- The edge functions' OpenAI path is rarely exercised — it runs only when `DEFAULT_LLM_PROVIDER` is `openai`, or when `ANTHROPIC_API_KEY` is unset — so its refreshed pins are the least-tested part of this change.

---

## 9. Decisions worth not re-litigating

- **No user-facing model picker.** Rejected in section 2. The maintenance burden is permanent and the user has no basis for the choice.
- **No automatic failover between providers.** Silently spending on the user's other account is a surprise nobody asked for, and it masks an invalid key. The explicit retry action does the same job with the user's consent.
- **The provider is not a tier axis.** Recording it in `app_metadata` would mean an SQL change and a migration for no behavioural difference, since limits are identical either way. `byok_enabled` stays boolean.
- **The stored preference is not cleared when its provider's key is removed.** The one-key-wins branch in `getActiveCredential()` covers the gap, and re-adding that key restores what the user actually asked for.
- **`timeline_byok_anthropic_key` keeps its name forever**, or keeps it until someone writes a read-old/write-new migration. It is not a naming inconsistency worth tidying.
- **Old exports were deleted, not shimmed.** The compiler catching seven call sites was the point; a shim would have traded that for a silent wrong-slot read.
- **Cost copy stays qualitative.** A concrete figure is a claim that drifts with provider pricing and varies by timeline size, and being wrong about money is worse than being vague about it.
