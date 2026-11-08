# Event details panel: summary first, then the story

Plan · Built, awaiting live verification · Nov 8, 2026 · written against `908b558` · design direction **B, stacked** in *Event Panel TL;DR Concepts*

| | |
|---|---|
| Component | `src/components/EventDetailPanel/EventDetailPanel.tsx` |
| Prompts | `src/services/llmPrompts.ts` (client), `supabase/functions/enrich-event/index.ts` (server, mirrored by hand) |
| Surfaces | Editor (`/editor`) and shared viewer (`/view/:id`), edit and view modes, World Events entries |
| How it works now | `EventDetailPanel.tsx` itself (state machine, scroll pin, persistence in `onDone`); streaming in `src/TIMELINE_ARCHITECTURE.md` §AI Generation Streaming |

Restyles the event side panel so the first thing a reader sees is a short bullet summary, with the full description below it as plain paragraphs, and the sources after that. The photo moves to a full-bleed header with the title on it. Load speed is a separate, later piece of work — nothing here changes *when* content arrives, only how it reads once it does.

## 1. Problem

- A description arrives as one block of 150–250 words in 14px text. In a 314px panel that is a wall; there is nothing to skim.
- The title sits below the photo and its credit, so the reader's eye lands on a caption before the name of the event.
- The sources list sits at the end with no visual break from the text above it.

## 2. Goals and non-goals

**Goals**
- Three stacked sections, in this order, on one scroll: **Summary** (3–5 bullets) → **The story** (the description, as paragraphs) → **Sources**. No tabs.
- The story reads like a page in a book: paragraphs only, no headings. A short event is one paragraph; a long one is several.
- Photo as a full-bleed header with date and title overlaid, built so that several photos can be swiped through later.
- Everything that exists today keeps working: descriptions generated before this change, both BYOK providers, the server path, the viewer cache, Regenerate / Remove, World Events entries.

**Non-goals**
- Making the panel load faster (prefetching, Wikipedia-first, dropping web search). Deferred on purpose.
- Storing more than one photo per event. The header is carousel-ready; filling it is phase 2 (§7).
- Headings inside the story. Decided against — they would be forced on most events.
- Any change to timeline generation, the events drawer, or export.

## 3. How the summary is stored

**Decision: the summary lives inside `events.description` as a markdown-style list at the top. No new column, no migration.**

The model is asked to write the description in this exact shape:

```
- One-sentence bullet.
- Another bullet.
- Three to five in all.

First paragraph of the story.

Second paragraph, only if the event warrants one.
```

A small parser, `parseEventDescription(text)` in a new `src/utils/eventDescription.ts`, splits this into `{ summary: string[], paragraphs: string[] }`: leading lines that start with `- ` are bullets, everything after the first blank line is paragraphs (split on blank lines, as the panel already does).

Why this and not a column:

- **An unapplied migration can't break anything.** `saveEvents.ts` upserts explicit columns; a new column that isn't live would fail every save. Every migration here is applied by hand and the April 2026 batch sat unapplied for three months (CLAUDE.md, "Never assume a migration…"). Text in an existing column has no such failure mode.
- **Drafts and the viewer cache need no change.** `LocalDraft`, `sessionStorage` trial drafts and `viewerEventCache` all carry `description` already.
- **Deploy skew degrades gracefully in both directions.** New site + old function: the old prompt returns plain paragraphs, the parser finds no bullets, and the panel simply shows no Summary section. Old site + new function: the old panel shows the bullets as a first paragraph of `- ` lines — legible, if plain — for the minutes a cached bundle lasts.
- **Old descriptions keep working.** Anything generated before this ships has no bullets, so it renders as story-only. Regenerate moves an event to the new shape. No backfill.

Nobody types descriptions by hand (the event form has no description field) and nothing exports them, so the format is only ever read by this parser.

If a later feature needs the bullets on their own (search, cards on the canvas, a batch summariser), promote them to a column then, with the same best-effort write pattern as `is_ai_generated`.

## 4. The prompt

Both copies change identically — `ENRICH_SYSTEM_PROMPT` / `buildEnrichUserPrompt` in `llmPrompts.ts` (used by both BYOK clients) and `SYSTEM_PROMPT` / `buildUserPrompt` in the edge function. Keep them character-for-character the same; the CLAUDE.md rule about hand-mirrored prompts applies.

Changes to the system prompt:

- Output shape, stated once and strictly: 3–5 bullets, each one sentence, each line starting `- `; a blank line; then the description as paragraphs separated by blank lines. No headings, no labels like "Summary:", no citations.
- Bullets must summarise *the description that follows*, not add new facts. The bullets are the TL;DR of the story, nothing else.
- Paragraphing rule, in the model's own terms: one paragraph for a simple event; split only when the event has distinct phases, places or consequences, and then keep each paragraph short. Length budget stays as today (~150 words simple, up to ~250 for a complex event) so cost and time don't move.

Everything else — web search first, neutral tone, don't invent facts — stays. The streaming transport (`delta` / `sources` / `done`) is untouched, so this is a prompt edit only on the server side.

Because the bullets come first in the stream, the Summary section fills in before the story does — a small, free improvement in perceived speed.

## 5. Layout

Top to bottom, inside the existing scroll container (the scroll-pin logic in the panel stays as is):

1. **Photo header** — new `PhotoHeader` component in the same folder.
   - Full-bleed to the card edges, fixed height (~220px at the default width; `shrink-0` as today, for the same flexbox reason).
   - A gradient from the card colour up over the bottom third; the date (`label-s-type1`, mono) and the title (`header-small`, Aleo 24px) sit on it, bottom-left.
   - Top-right cluster on the photo: Edit and Delete (edit mode, not read-only) and Close (below `md` only, as now). Same `HeaderIconButton` glass styling — it already assumes a dark backdrop.
   - Takes `photos: { url, attribution }[]`. With one entry it is a static image. With several: swipe on touch, left/right arrow buttons that appear on hover on desktop, and small dots bottom-right. Phase 1 always passes one.
   - No image (Wikipedia had none, or still loading): the same block at a shorter height with the date and title on the plain card colour, pulsing while the lookup is in flight. The skeleton rules from today carry over unchanged (`ImageState`, `imageLoaded`).
   - Credit line under the header, 11px grey, as today's attribution but readable.
2. **Summary** — label `SUMMARY` (`label-s-type1`, uppercase, grey), then a `<ul>` of bullets with a small dot, `body-lg` (16px/24px) in `#ECEEF1`.
   - Skeleton: three short bars.
   - Hidden entirely when the parsed summary is empty (old descriptions, old function, model ignored the format).
3. **The story** — label `THE STORY`, then paragraphs in `body-lg` at `#C4C7CC`, 16px gap between paragraphs, `max-width: 62ch`. A hairline above the section.
   - Skeleton: two four-line blocks, as today.
   - When there is a summary but no paragraphs yet (mid-stream), the skeleton sits under the bullets.
4. **Sources** — label `SOURCES`, same link list as today under a hairline. Skeleton as today.
5. **Footer** — Regenerate / Remove, unchanged.

Error state replaces sections 2–3 with today's message and retry buttons.

**Width.** The design was drawn at 440px; the panel defaults to 320 (314 card) with a 400 max. Bullets and 16px paragraphs still work at 314, so no change in phase 1. If it feels tight once built, add an `EVENT_PANEL_DEFAULT_WIDTH = 360` in `constants/panels.ts` rather than touching the shared default.

**Mobile (< `md`).** Full-screen as today. The photo header is the natural place for the close button, which already only renders at this breakpoint.

## 6. Work, in order

1. `src/utils/eventDescription.ts` — the parser. Pure function; handle `*` as well as `-` bullets, trailing whitespace, a model that emits bullets with no story, and plain text with no bullets.
2. `PhotoHeader.tsx` — props: `photos`, `date`, `title`, `loading`, `actions` (the button cluster as children). Carousel logic (index state, pointer drag, arrow buttons, dots) included but exercised only by the one-photo case for now.
3. `EventDetailPanel.tsx` — replace the header/photo/title block with `PhotoHeader`; derive `summary` and `paragraphs` from `description` via the parser on every render (it already re-renders per delta); add the three labelled sections and their skeletons. State machine, abort handling, persistence in `onDone`, confirmations and the resize handle are untouched.
4. `llmPrompts.ts` and the edge function — the prompt change, identical in both.
5. Copy — the Regenerate confirmation still says "runs a new AI request, including a fresh web search"; still true, keep it. Screen-reader status strings unchanged.
6. `src/TIMELINE_ARCHITECTURE.md` — add a short "Event detail panel" note under §Data Flow & Persistence describing the description format and the parser. CLAUDE.md "Docs" list gains this file.

Checks before pushing: `npx tsc --noEmit -p tsconfig.app.json` (10 pre-existing errors, add none), `npm run lint`. Then by hand, since there is no test framework:

- Fresh event, server path (signed in, no key): bullets appear first, then paragraphs, sources last; the saved `description` has the list on top.
- Fresh event on each BYOK provider: same.
- An event with a description from before the change: story only, no Summary label.
- Regenerate on that event: now has a summary.
- Shared viewer as an anonymous visitor with a key: generated content lands in `viewerEventCache` and re-renders correctly on reopen.
- A World Events entry (`we:` id): read-only, no Edit/Delete, still generates.
- Event with no Wikipedia image: short header, no pulse once settled.
- Below `md`: full screen, close on the photo, swipe does nothing with one photo.

Deploy order: site and function ship from the same merge; the site goes live first (CLAUDE.md, deploy skew). The parser's no-bullets fallback is what covers that window — confirm it by opening a fresh event in the first minutes after the Netlify deploy, before the Actions run finishes.

## 7. Phase 2: several photos

Needs, in this order, and none of it is in phase 1:

- Somewhere to store more than one image. Either a `images jsonb` column (migration, hand-applied, best-effort write) or a live fetch of the page's images on open (no storage, but every open pays for it and quality filtering of Wikipedia's `prop=images` — flags, icons, maps — is real work).
- A per-event attribution per photo; the credit line already follows the current slide in the design.
- `PhotoHeader` gets its array and nothing else changes.

## 8. Open questions

- Should Regenerate be offered more prominently on old, summary-less descriptions ("Add a summary"), or is the normal Regenerate enough? Leaning: enough. Both cost a billed request.
- `body-lg` in the story at 16px vs. today's 14px `body-m`: confirm on a real 314px panel before committing to it. The design read better at 16px, but the mockup was 126px wider.
