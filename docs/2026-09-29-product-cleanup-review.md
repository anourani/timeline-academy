# Product cleanup review: nine weighted improvements

_2026-09-29. A read-only audit of the client, services, and edge functions, written as a ranked backlog with evidence so each item can be judged before any effort is spent. The first pass ran on a checkout ten days behind `main`; every item below was then re-verified against `main` at the merge of PR #130 (the streaming generation work). That re-check changed two things: the Cancel race in item 8 is already fixed upstream, and the streaming rewrite orphaned `useAIMode` and the buffered generate path, which item 7 now lists._

## Context

You asked for a deep dive into the product experience plus obvious dead-code cleanup, with 3–10 improvements weighted by gravity, and nothing suggested for its own sake. Three explorers walked the client flows, the service/edge-function layer, and the import graph from `src/main.tsx`; I re-verified every claim below against the source before including it. Anything I could not confirm, or that is deliberate per CLAUDE.md, is either omitted or listed under "considered and not recommended".

The headline: the codebase is in decent shape. There are no TODOs, no commented-out code, no real helper duplicates, and the client/server prompts are kept in sync on purpose. What *is* wrong clusters around one theme: **the product promises to keep your work, and several paths quietly drop part of it or hide that something failed.** Those are worth fixing. The dead code is real but small, and is item 7, not item 1.

## Weighting key

Weight is 1–10, roughly: user impact × confidence that it's real, discounted by effort and risk.

| # | Improvement | Impact | Effort | Risk | Weight |
|---|---|---|---|---|---|
| 1 | Server error messages never reach the user | High | Tiny | None | **9** |
| 2 | Sign-in migration and Duplicate drop most of the timeline | High | Small | Low | **8** |
| 3 | Excel export/import round-trip loses categories | Med-High | Small | Low | **7** |
| 4 | Opening Settings writes placeholder text into the description | Med-High | Tiny | None | **7** |
| 5 | Save failures are invisible; no client-side event cap | High | Small | Low (product call) | **6** |
| 6 | Wrong OTP code is reported as "Code expired" | Medium | Tiny | None | **6** |
| 7 | Dead code sweep (10 files, 5 packages, stale docs) | Low (users) / Med (maintainers) | Small | None | **5** |
| 8 | byok-anon generation discarded at draft cap; no Cancel button on touch | Medium | Small | Low | **4** |
| 9 | Failed timeline delete leaves the editor unbound | Low-Med | Tiny | None | **4** |

---

## 1. Server error messages never reach the user — weight 9

**Status: done in the same PR as this document.** On current `main` the streaming generate route (`aiTimeline.ts` `streamTimeline`) uses a raw `fetch` and already reads the server's `{ error }` body, so the fix matters for the two calls still going through `supabase.functions.invoke`: classify (live, `aiTimeline.ts:94`), delete-account (`SidePanelBody.tsx:519`), and the buffered `generateTimeline` (`:165`), which item 7 now identifies as dead.

**Evidence.** `src/services/aiTimeline.ts:79-87` and `:156-163` throw `error.message` on a non-2xx and then check `'error' in data` on the 2xx body. The function only ever sends `{ error }` with 400/401/429/500 (`supabase/functions/generate-timeline/index.ts:60,63,70,99,131`). supabase-js puts only "Edge Function returned a non-2xx status code" in `error.message`, so the Free-tier "You've reached the daily limit…" (429), "Sign in to generate timelines." (401), and the 500 message are all replaced by that generic string, shown in red at `NewTimelineScreen.tsx:514-516`. `SidePanelBody.tsx:413-415` has the same dead `data?.error` pattern for `delete-account`.

`userApiKey.ts:107-118` already has `readErrorMessage(error)` that reads the real body from `error.context`. It just isn't shared.

**Fix.**
- Move `readErrorMessage` to `src/lib/supabase.ts` (or export it from `userApiKey.ts`) and use it in both `aiTimeline.ts` sites and `SidePanelBody.tsx` delete-account.
- Delete the four now-dead `'error' in data` branches.

**Files.** `src/services/aiTimeline.ts`, `src/services/userApiKey.ts`, `src/components/SidePanel/SidePanelBody.tsx`.

## 2. Sign-in migration and Duplicate drop most of the timeline — weight 8

**Status: done.** `createTimelineFrom` now takes the whole timeline and writes every column through a shared `toEventRow` in `saveEvents.ts`; Duplicate goes through `loadTimeline` + `createTimelineFrom`, so it gets the limit check and every column, and an events-insert failure no longer leaves an empty "(Copy)" row behind.

**Evidence.** Two write paths persist only a subset of what the load path reads (`useTimeline.ts:154-187` reads description, categories, chapters, vertical_scale, group_by_category, and per-event description/image_url/image_attribution/sources):

- **Guest → account migration.** `App.tsx:657` calls `createTimelineFrom(draft.title, draft.events, draft.scale, draft.verticalScale)`. `useTimeline.ts:198-229` inserts `{ title, user_id, scale, vertical_scale }` and events with only id/title/dates/category. `LocalDraft` (`draftStorage.ts:7-19`) carries description, categories, chapters, groupByCategory, and the full events. All of it is dropped at the exact moment the product invites the user to sign in to keep their work.
- **Duplicate (signed-in).** `SidePanelBody.tsx:598-661` inserts `{ title, user_id, scale }` and maps events to title/start_date/end_date/category. Same losses, plus: if the event insert fails an empty "(Copy)" row is left behind, and there's no limit pre-check.

**Fix.**
- Widen `createTimelineFrom` to accept the whole draft shape (`Pick<LocalDraft, 'title'|'description'|'events'|'categories'|'chapters'|'scale'|'verticalScale'|'groupByCategory'>`) and write every column. Reuse the event-row mapping already in `src/utils/saveEvents.ts` so the column list exists once.
- Rewrite the signed-in Duplicate to `select('*')` the timeline row, strip id/user_id/created_at/updated_at/is_public, insert it, and copy events with all columns. Run `checkCreateTimelineLimits` first (already exists in `useTimeline.ts`).
- The byok-anon Duplicate at `:599-619` already spreads the whole draft; leave it.

**Files.** `src/hooks/useTimeline.ts`, `src/App.tsx` (call site), `src/components/SidePanel/SidePanelBody.tsx`, `src/utils/saveEvents.ts` (reuse).

## 3. Excel round-trip loses categories — weight 7

**Status: done.** Export writes the category label; all three call sites pass their categories; the side-panel template uses the default labels its importer matches.

**Evidence.** `excelExport.ts:12` writes `event.category`, which is the id (`category_1`). Both importers match on the *label*: `TimelineSettingsPanel.tsx:126-128` against the timeline's categories, `ImportCSVModal.tsx:105-108` against `DEFAULT_CATEGORIES`, falling back to the first category. So export → import puts every event in category 1. The side-panel template (`SidePanelBody.tsx:555`) also ships sample categories `['Personal Life', 'Career']` that match no default label ("Category 1"–"4"), so the template itself doesn't round-trip.

**Fix.**
- `exportEventsToExcel(events, title, categories)`: write the label, looked up from the categories list. All three call sites have categories in scope (`App.tsx:1173`, `SidePanelBody.tsx:437,454`, `TimelineSettingsPanel.tsx:112`; the draft path has `draft.categories`).
- Template: pass the actual default labels instead of the hard-coded pair.
- `ImportCSVModal` still accepts only `.xlsx/.xls` (`:154`); the popup was restyled upstream, so check its visible title says spreadsheet rather than CSV while you're there. Leave the file name alone unless you want the churn.

**Files.** `src/utils/excelExport.ts`, `src/App.tsx`, `src/components/SidePanel/SidePanelBody.tsx`, `src/components/Settings/TimelineSettingsPanel.tsx`, `src/components/AIMode/ImportCSVModal.tsx`.

## 4. Opening Settings writes placeholder text into the description — weight 7

**Status: done in the same PR as this document.**

**Evidence.** `TimelineSettingsPanel.tsx:95-99`: an effect calls `onDescriptionChange(DEFAULT_TIMELINE_DESCRIPTION)` whenever the panel opens with an empty description. Consequences: the timeline goes dirty, autosaves, and its tile jumps to the top of the side panel just from opening Settings; the user cannot clear the description (the effect refills it); and the placeholder copy ("…You can edit the header details in the settings panel.", `defaults.ts:3`) is real content that then renders on the public share page (`TimelineViewer.tsx:117,188-193`).

**Fix.** Delete the effect. Put `DEFAULT_TIMELINE_DESCRIPTION` on the textarea's `placeholder` attribute (`:241-247`). Check `TimelineViewer` and the editor header render nothing when description is empty (they already handle `''`).

**Files.** `src/components/Settings/TimelineSettingsPanel.tsx`.

## 5. Save failures are invisible; no client-side event cap — weight 6

**Evidence.** `useAutosave.ts:148-157` sets `saveStatus = 'error'` on failure, but `GlobalNav.tsx:82` has `SHOW_SAVE_STATUS = false`, so the indicator never renders and a failed save is only a `console.error`. Separately, `useEvents.ts:12-19` and `addEvents` apply no cap, so a user at their plan limit can add events; the server trigger rejects the insert (`20260803000300_harden_security_definer.sql:47-49` `raise exception 'Event limit reached'`), autosave enters `'error'` silently, and the events vanish on reload.

The indicator was hidden deliberately ("for now"), so this is partly a product call. The minimum fix that doesn't reopen that decision:

**Fix.**
- Render `SaveStatusIndicator` **only when `saveStatus === 'error'`** (keep the "hidden for now" behaviour for `saving`/`saved`). One-line change at `GlobalNav.tsx:192`.
- Add a cap check to `addEvent`/`addEvents` using `getCurrentLimits()` from `lib/limits.ts`, returning a `LimitReachedError`-style result the callers already know how to alert on (`limitReachedMessage` in `App.tsx`).

If you'd rather bring the whole indicator back, that's a one-flag flip, but I'd treat that as a separate visual decision.

**Files.** `src/components/Navigation/GlobalNav.tsx`, `src/hooks/useEvents.ts`, `src/lib/limits.ts` (reuse).

## 6. Wrong OTP code is reported as "Code expired" — weight 6

**Status: done in the same PR as this document.**

**Evidence.** `AuthModal.tsx:75-80` checks `'Token has expired'` before `'invalid'`. Supabase Auth returns the single string "Token has expired or is invalid" for both a typo and a real expiry, so every mistyped code shows "Code expired. Please request a new one." and sends the user back through the email flow they didn't need.

**Fix.** Map that combined message to one honest line: "That code didn't work. Check it and try again, or request a new one." Keep the branch for genuine `otp_expired`.

**Files.** `src/components/Auth/AuthModal.tsx`. (`OtpInput` gained `autoComplete="one-time-code"` upstream, so that adjacent fix is already in.)

## 7. Dead code sweep — weight 5

This is the explicit cleanup ask. Everything here is verified unreachable from `src/main.tsx`, or exported with zero importers. `tsconfig` already has `noUnusedLocals`, so all dead code in this repo is at the export/file level.

**Delete these files (11, ~800 lines):**
- `src/hooks/useAIMode.ts` (191 lines). The streaming `GenerationContext` replaced it; its only remaining mention is a comment at `lib/limits.ts:25`. With it goes the buffered `generateTimeline` in `aiTimeline.ts:111-196`, whose only caller it was (`classifySubject` and `streamTimeline` stay; `LimitReachedError` stays, `useTimeline` and `App.tsx` use it). The `generate-timeline` function keeps its buffered branch for cached bundles per CLAUDE.md.
- `src/utils/csvParser.ts`, `src/utils/csvExport.ts` (dead since Excel import replaced CSV; `excelSheet.ts`/`excelExport.ts` are the live equivalents)
- `src/components/ui/card.tsx`, `label.tsx`, `sheet.tsx`, `tabs.tsx`, `tooltip.tsx` (scaffolded shadcn, never imported)
- `src/components/FeedbackPanel/FeedbackPanel.tsx` (123 lines, never imported)
- `src/components/AddEventButton/AddEventButton.tsx` (never imported)
- `src/components/Timeline/TimelineScrollIndicator.tsx` — **judgment call**: its own comment says "deliberately mounted nowhere" (unmounted in `04facd5`, 2026-09-19). Delete, or keep if you plan to bring it back. If deleted, also drop `SCROLL_INDICATOR_HEIGHT` from `constants/timeline.ts`.

**Remove from `package.json` (5):** `@supabase/auth-ui-react`, `@supabase/auth-ui-shared`, `@radix-ui/react-label`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`. Then `npm install` to refresh the lockfile. (`tailwindcss-animate`, `date-fns`, `react-day-picker`, `@radix-ui/react-dialog`, `class-variance-authority` are all live; keep them.)

**Zero-use exports to delete:** `timelineUtils.getCurrentTimelinePosition` (+ its private `getMonthPosition`, ~40 lines), `useAccountTier.isAnonymousTier`, `viewerEventCache.clearCachedEvent`, `models.modelsByProvider`, `pillDefinitions.SUBJECT_TYPE_SUFFIX`, `timeline.EVENT_HEIGHT`, the compatibility re-exports at `aiTimeline.ts:33` and `eventEnrichment.ts:15`, the `accordion-*` keyframes in `tailwind.config.js`.

**Dead parameters/props:** `subjectType` is sent by `aiTimeline.ts:148` (and threaded into `streamTimeline` at `:308`) but no function version has ever read it and the BYOK path ignores it too — drop the param through `GenerationContext` → `aiTimeline`. `onClearTimeline` (`Header.tsx:112` → `TimelineSettingsPanel.tsx:46`) and `EventForm`'s `onImport` prop (`:23`) are passed but unused. The three `alert`s in `EventForm.tsx:106-119` are unreachable (submit is disabled until valid, `maxLength` blocks long titles).

**Stale docs/comments to fix in the same commit:** CLAUDE.md still lists `csvParser` under `utils/`; `excelSheet.ts:42` mentions "the CSV importer"; `EventDetailPanel.tsx:414` describes `FeedbackPanel` as live; `TIMELINE_ARCHITECTURE.md` describes `TimelineScrollIndicator` as rendered (lines ~49, 51, 151, 157, 251-265, 273, 552, 1084) and a `chapterLabel` prop that doesn't exist; `FloatingToolbar.tsx:138` refers to a Present toggle that isn't there; `_shared/prompts.ts:4`, `llmPrompts.ts:82`, `classify.ts:5`.

**Not part of this sweep (deliberate per CLAUDE.md):** `set-byok-flag` function, the `_shared/cors.ts` header echo, tolerated old request shapes in `generate-timeline`, the client/server prompt copies, `useIsMobile` vs `useIsNarrow` (different breakpoints on purpose).

## 8. byok-anon generation discarded at the draft cap; no Cancel on touch — weight 4

**Evidence.** The streaming rewrite on `main` moved generation into `src/contexts/GenerationContext.tsx` and, in doing so, fixed the Cancel race the first pass found: each run now owns an `AbortController` and a run id (`:106-143`), so a cancelled run's late result is dropped and the fetch is actually aborted. Two things remain:

- `GenerationContext.tsx:176`: the pre-flight limit check still runs only `if (user)`. A byok-anon user with 3 drafts pays their provider for a full generation, then `App.tsx` gets `null` from `createDraft()`, alerts the limit, and navigates back to `/`. The result is thrown away.
- Cancel is still Esc-only (`App.tsx:1415` "Press Esc to cancel"), so phone users can't cancel a generation at all.

**Fix.**
- Extend the pre-flight to byok-anon: `byokAnonDraftStore.getAllDrafts().length >= MAX_DRAFTS` (both already exported from `draftStorage.ts`), failing with the same `limitReachedMessage('timeline')` the editor uses.
- Add a visible Cancel button next to the Esc hint that calls the context's `cancel()`.

**Files.** `src/contexts/GenerationContext.tsx`, `src/App.tsx`.

## 9. Failed timeline delete leaves the editor unbound — weight 4

**Status: done in the same PR as this document.**

**Evidence.** `App.tsx:920-938`: `setLoadedTimelineId(null)` runs *before* the delete. On failure the user sees "Failed to delete. Please try again.", but the editor is now unbound: later edits never autosave, Share is disabled, and a retry takes the `activeDraftId` branch (null when signed in), deletes nothing, and navigates away as if it succeeded.

**Fix.** Capture `deletingId`, cancel the pending save, perform the delete, and only on success call `setLoadedTimelineId(null)`. On failure restore nothing (it was never cleared).

**Files.** `src/App.tsx`.

---

## Considered and not recommended right now

Listed so you know they were looked at, and why they didn't make the cut.

- **Replacing the 35 `alert()` calls.** `ConfirmationModal` is only suitable for confirmations (destructive style, closes on confirm, string-only). Most alerts are success/failure notices and need a toast or inline notice; the repo has none. Worth doing, but it's a small design decision first, not a cleanup.
- **`Modal.tsx` accessibility** (no Escape, no focus trap, no `role="dialog"`; used by sign-in, API-key, and trial-gate modals). The Radix `ui/dialog.tsx` already does all of this. Real, but a visual/behavioural migration of three modals rather than cleanup.
- **Server-side helper duplication** (`authenticateUser` ×5, `json()` ×4, admin client ×4 across the edge functions). Pure tidiness with a function deploy attached and zero user effect. Do it only when you next touch those functions.
- **Schema leftovers** (`timeline_categories` table never read/written; `cleanup_ai_rate_limits()` never called). Both need a hand-applied migration and the verification runbook depends on both. Not worth the operational risk for a table nobody reads.
- **Auto-enrichment for visitors** (`EventDetailPanel.tsx:151-162` fires AI on any event open, including view mode, so signed-out visitors see an error and signed-in visitors spend their own quota on someone else's timeline). This is a product policy question, not a bug.
- **Router catch-all / viewer not-found state.** Nice polish, low frequency.
- **OpenAI-fallback server settings drift** (`max_tokens` 4096 vs 8192, classify 32 vs 256 vs `models.ts`). Only runs with `DEFAULT_LLM_PROVIDER=openai`, which is not the production default.

## Suggested execution order

Items 1, 4, 6, 9 are each under 20 lines and carry no risk: one small PR. Items 2 and 3 share the "write every column" theme: second PR. Item 7 (dead code) is its own PR so the diff is obviously deletions only. Items 5 and 8 last, since each has a small product decision inside it.

## Verification

No test framework exists, so every check is manual. For each PR:

1. `npm run lint` and `npm run build` clean (the build is the type check).
2. `npm run dev`, then per item:
   - **1:** sign in as a Free user, generate 6 times; the sixth shows the daily-limit sentence, not "non-2xx status code". Or temporarily return `json({error:'x'},429)` from the function locally.
   - **2:** as a guest, generate a timeline (AI categories + chapters), open an event to enrich it, sign in; confirm the migrated timeline keeps categories, chapters, description, and the event details. Then Duplicate it and check the copy.
   - **3:** export a timeline with a custom category label, re-import via both importers; events land in the right category. Download the template and import it unchanged.
   - **4:** open Settings on a fresh timeline; the side-panel tile must not reorder, the description must stay empty, and `/view/:id` must show no placeholder text.
   - **5:** sign in as Free, pad to 300 events, add one more; expect a limit message rather than a silent drop after reload.
   - **6:** enter a wrong OTP code; message says the code didn't work, not that it expired.
   - **7:** `npm run build` passes; `grep -rn "csvParser\|FeedbackPanel\|auth-ui" src package.json` returns nothing; open `/`, `/editor`, `/view/:id`, `/privacy`, `/terms` once each.
   - **8:** as byok-anon with 3 drafts, hit Generate; expect the limit before any provider call (check the Network tab). On a phone, the Cancel button stops a generation.
   - **9:** block the delete (e.g. go offline), delete a timeline, see the failure alert, then make an edit and confirm it still autosaves once back online.
3. Production only: after the dead-code PR merges, load the live site once and confirm no CSP error in the console (no new hosts are added, so none expected).
