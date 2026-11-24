# Event view: open an event as a full page

PRD · Built, not yet verified live · Nov 24, 2026 · written against `d86c199`; see §14 for what the build changed · design direction **E** in *Immersive Event View* (claude.ai canvas, frames `E-Feature` and `E-Feature-Mobile`)

| | |
|---|---|
| Replaces | The right-hand side panel in `src/components/EventDetailPanel/EventDetailPanel.tsx` |
| Mounted from | `src/App.tsx` (editor, `/editor`) and `src/components/TimelineViewer/TimelineViewer.tsx` (shared viewer, `/view/:id`) |
| Surfaces | Desktop (≥ `md`) and phone (< `md`). Edit and view modes. Timeline events and World Events entries. |
| How it works now | `src/TIMELINE_ARCHITECTURE.md` §Event Hover Cursor › Where Edit and Delete went; `docs/2026-11-08-event-panel-tldr-plan.md` |

Clicking an event today slides a 352px panel in from the right. This PRD replaces that panel with a full-page **event view**. The bar the user clicked grows into the page, and the page answers one question: *what happened here?* At the top sit photos you can browse and an "At a glance" list (when, where, who, age). Below them are the Summary, The story and Sources the panel already has.

The opening animation is the core of the change, not decoration. It is what makes this feel like stepping *into* the event rather than opening a sidebar. §4 specifies it in full.

---

## 1. Problem

- **The panel is narrow.** At 352px, the photo is a thumbnail-sized strip and the story is a wall of 14–16px text. The event never gets the room it deserves.
- **The panel feels like a settings drawer.** It slides in with the same motion as Settings and the side panel, and nothing connects it to the bar that was clicked. The click doesn't feel like it went anywhere.
- **The panel answers "what is the story?" but not "where, who, how old were they?"** Readers have to dig those out of the paragraphs.
- **One photo, often blurry.** `fetchEventImage` asks Wikipedia for a 600px thumbnail, and the panel shows exactly one. Most events have several relevant pictures on their Wikipedia page.

## 2. Goals and non-goals

**Goals**
- Clicking an event opens a full-page view of **that one event**. The clicked bar visibly becomes the page, and closing visibly returns into the bar.
- Top of the page: a **photo viewer with thumbnails** (several photos, sharp at full width) and an **At a glance** list.
- Keep Summary → The story → Sources exactly as they read today, including streaming, skeletons and the scroll pin.
- Keep every existing behaviour of the panel: auto-generation on open, Regenerate / Remove, Edit / Delete in edit mode, World Events entries read-only, viewer-cache persistence, both BYOK providers and the server path, error + retry.
- Degrade cleanly: no photos, one photo, old descriptions with no At-a-glance data, an edge function the site has outrun.

**Non-goals**
- **No moving between events.** No previous / next buttons, no arrow keys between events, no "related events". Readers open an event, read it, close it. This was tried in earlier directions (A–C) and cut.
- **No generated hero art.** No category-colour washes, giant year numerals, light streaks or other decoration in place of real information.
- No database migration. No change to timeline generation, the events drawer, export or the World Events fetch.
- Making descriptions arrive faster. Same deferral as the TL;DR plan.

## 3. The page

### Desktop (≥ `md`)

A fixed, full-viewport layer above everything (the side panel and dock included), background `#0B0B0B`. The editor stays mounted underneath and keeps its state. Content scrolls inside the layer, with no visible scrollbar (global rule).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [× Close  esc]                                       [✎ Edit] [🗑 Delete] │  ← top bar, solid strip, sticky
│                                                                          │
│  ● Science   Paris & discovery        ┌──────────────────────────────┐   │
│                                       │                              │   │
│  Discovers polonium                   │        main photo            │   │
│  and radium                           │        640 × 384             │   │
│                                       │  caption · credit     1 / 5 ⤢│   │
│  AT A GLANCE                          └──────────────────────────────┘   │
│  When     July – December 1898 · about 6 months                          │
│  Where    Paris, in a converted shed …   [▢][▢][▢][▢][▢]  thumbnails     │
│  Who      Marie Curie and Pierre Curie                                   │
│  Age      30                                                             │
│                                                                          │
│  SUMMARY                              THE STORY                          │
│  • …                                  Paragraphs …                       │
│  • …                                  SOURCES                            │
│  • …                                  …               [Regenerate][Remove]│
└──────────────────────────────────────────────────────────────────────────┘
```

- **Grid:** two columns inside a centred container of max 1200px, 64px gap. The left column (~500px) holds the title block, At a glance and Summary. The right column (~640px) holds the photo viewer, The story and Sources. Below ~1100px wide the photo viewer moves above the title and the page becomes one column.
- **Top bar:** Close (with an `esc` hint) on the left. In edit mode, the existing Edit and Delete icon buttons go on the right, with the same visibility rules as today (hidden for AI timelines and World Events entries). The bar is sticky, on a `#0B0B0B` strip that fades out at its bottom edge so content scrolls under it cleanly.
- **Title block:**
  - A category chip (category colour dot plus label, tinted at ~12% in the category colour), and a chapter chip when the timeline has chapters.
  - The title in Aleo, 46px.
  - The title is the page's `h1` and the dialog's accessible name.
- **Footer actions:** Regenerate and Remove sit after Sources, as quiet secondary buttons. Same confirmations and same rules as today: edit mode only, and not for World Events entries.

### Phone (< `md`)

One column, in this order: photo viewer (full-bleed, 300px tall), thumbnail row, title block, At a glance, Summary, The story, Sources, footer actions. A 44px Close button floats over the photo's top-left on a translucent dark chip. Edit and Delete sit top-right over the photo. When there is no photo, the title block moves up under a plain top bar.

## 4. The opening animation (the differentiator)

### The idea

The bar the reader clicked is the thing that opens. It grows, in place, from its exact spot on the timeline to fill the screen, and the page settles into it. The timeline behind falls back as if the camera pushed forward into the event. Closing runs the same path backwards, into wherever that bar is now.

Nothing else in the product moves this way. Settings and the side panel slide; the event *opens*. That difference is the point of the feature, so treat the timings below as part of the spec, not suggestions.

### Sequence — open

Times are from the click (or Enter on a focused event). Easing names are the three curves already defined in `src/index.css`: `--ease-enter` (easeOutCubic), `--ease-swipe` (easeInOutQuart), `--ease-pop`. They should be mirrored as JS constants in a new `src/constants/motion.ts`, because the Web Animations API cannot read CSS variables.

| # | When | What | Duration · easing |
|---|---|---|---|
| 0 | 0ms | The clicked bar shows its selection ring (2px category colour, 4px offset, 7px radius). On touch, the existing hover-cursor `bloom()` fires at the tap point. | instant |
| 1 | 80ms | **Morph.** A layer starts at the bar's exact on-screen rectangle and radius (4px), filled with the bar's own tint (category colour at 45%, `${color}73`). It grows to the full viewport with 0 radius, while its fill crossfades to `#0B0B0B`. The bar's 8px colour stripe and its label fade out over the first 200ms. | 700ms · `--ease-swipe` (fill: 500ms ease) |
| 1 | 80ms | **Push in.** The editor scales 1 → 1.15 around the bar's centre and fades to 0. | transform 700ms · `--ease-swipe`; opacity 450ms ease |
| 2 | 550ms | **Header.** The top bar and title block rise 14px and fade in. | opacity 400ms ease · transform 600ms `--ease-enter` |
| 3 | 650ms | **Photos.** The photo viewer scales 0.96 → 1 and fades in. On phone, the photo slowly zooms 1.08 → 1 (2.4s `--ease-enter`, a slow settle). | opacity 450ms · transform 650ms `--ease-enter` |
| 4 | 800ms | **Content.** At a glance + Summary, then The story + Sources, rise 30px and fade in, 90ms apart. | opacity 450ms · transform 650ms `--ease-enter` |

The page is readable at about 1 second. Phone uses the same sequence with a 650ms morph.

### Sequence — close

Close, Esc, or the browser back gesture (see §9):
1. The page content fades out (150ms).
2. The bar's rectangle is **re-measured** (`[data-event-id="…"]`). The morph layer shrinks back into it (450ms, `--ease-swipe`, fill back to the bar's tint), and the editor scales 1.15 → 1 and fades in.
3. The layer is removed, and focus returns to the event bar.

If the bar can't be found (the event was deleted from the page, or a World Events entry has no matching element), use the fallback instead (below).

### Rules

- **Only animate `transform`, `opacity` and `clip-path`.**
  - Implement the morph as one fixed, full-viewport element. Animate its `clip-path: inset(top right bottom left round r)` from the bar's rectangle to `inset(0 round 0)`.
  - Do **not** animate `left/top/width/height` (the mockups do, for convenience). Layout animation on a full-screen layer stutters on mid-range phones.
- **Use the Web Animations API** (`element.animate`) in a small hook, `useEventMorph`, which owns the open and close animations.
  - It keeps the `Animation` objects, so an Esc pressed mid-open calls `reverse()` from wherever the animation is. There's no jump back to the start.
  - A second click during the open is ignored.
- **The editor is not unmounted**, so the timeline's scroll position, selection and state survive.
  - Mark it `inert` while the view is open. Scope the scale-and-fade to the timeline's content wrapper, not `<body>`.
  - Set `will-change: transform, opacity` only while an animation runs, then clear it.
- **Reduced motion** (`prefers-reduced-motion: reduce`, read the same way `CurtainIntro.tsx` and `EventHoverCursor.tsx` already do):
  - No morph, no scale, no rise.
  - The page crossfades in over 150ms and out over 120ms.
  - The selection ring still shows.
- **Fallback when there is no source rectangle**: the page fades in and rises 24px over 300ms `--ease-enter`. This covers keyboard-only opens with no element on screen, deep links (if added later), and World Events entries without a bar element.
- **Generation must not wait for the animation.** Start `runGeneration` and the photo fetch at click time, exactly as now. Skeletons appear inside the page as it settles, and streamed text that arrives early simply renders.

## 5. Photos

### Where they come from

- Today, `fetchEventImage(title)` in `src/services/eventEnrichment.ts` → `src/services/wikipediaImage.ts` returns **one** 600px thumbnail.
- Add `fetchEventPhotos(title)` in a new `src/services/wikipediaPhotos.ts`, built on the same page lookup (`searchPage`):
  1. Ask the article for its lead image (`prop=pageimages`, as now), at `pithumbsize=1600`.
  2. Ask for the article's other images in one request on **`en.wikipedia.org`**: `action=query&generator=images&titles=<page>&gimlimit=30&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600&format=json&origin=*`. Commons files resolve through en.wikipedia's shared repository.
  3. Keep JPEG, PNG and WebP only (no SVG or GIF). Keep only images at least 800 × 500, and drop file names that look like chrome: `/logo|icon|flag|map|signature|coat.of.arms|seal|symbol|portal|commons-/i`.
  4. Lead image first, then the rest in API order. Cap at **6**.
  5. For each photo:
     - **Caption:** `extmetadata.ImageDescription`, HTML stripped (reuse `stripHtml`) and cut to ~120 characters at a word boundary. Fall back to the file name with the extension and underscores removed.
     - **Credit:** `Artist` + `LicenseShortName`, as `fetchImageMeta` already builds it.
- **CSP needs no change.** `connect-src` already allows `https://en.wikipedia.org`, and `img-src` already allows `https://*.wikimedia.org`, which covers `upload.wikimedia.org`. Check this in `netlify.toml` before merging. A missing host fails only in production (CLAUDE.md).

### Storage

- **Lead image:** keep persisting it in `imageUrl` / `imageAttribution`, unchanged, now at 1600px. Older events keep their 600px URL and still render.
- **The rest of the gallery is not persisted to the database** in this version. Cache it in the browser, in `localStorage`, keyed by event id + title with a version number. Use the same shape and eviction as `src/services/worldEventCache.ts`, in a new `src/services/eventPhotoCache.ts`.
  - Rationale: no migration (CLAUDE.md, "Never assume a migration … has been applied"), and the photos cost nothing to refetch.
  - A later `events.photos jsonb` column can be added on its own, if wanted.
- Remove clears the lead image as today, and also drops the cached gallery for that event.

### The viewer

`PhotoHeader.tsx` is already built for several photos (swipe, dots, credit line per slide), but the new layout differs enough that it should become a new `PhotoViewer.tsx`:
- **Desktop:** main photo at 640 × 384, `object-fit: cover`, 14px radius.
  - Caption and credit sit on a bottom gradient, with an `n / N` counter top-right.
  - A row of 5 thumbnail buttons sits below (116 × 72, 8px radius). The selected one has a 2px category-colour ring at full opacity; the others are at 55%.
  - Changing photo crossfades over 450ms.
  - Left and right arrow keys move between **photos**, but only while focus is inside the viewer. They never move between events.
- **Phone:** full-bleed at 300px with the same caption gradient and counter, swipe between photos, and a thumbnail row (58 × 44) under it.
- **States:**
  - Loading: the main frame holds its size and pulses (same as `PhotoHeader` today).
  - 1 photo: no thumbnails, no counter.
  - 0 photos: the viewer is removed. On desktop the page becomes one centred column of max 720px, title block first. No empty frame.
- **Full-screen view:** the ⤢ button, or a click on the main photo, opens the photo full-screen with its caption, credit, arrows and Esc. Treat this as a fast follow if it threatens the date.
- **Alt text:** the caption.

## 6. At a glance

| Row | Source | Shown when |
|---|---|---|
| When | **Client.** Formatted from `startDate` / `endDate` (`formatDateLong`, month-level when the dates are first and last of a month), plus a rough duration ("about 6 months", "8 days"). Single-day events show the one date. | Always |
| Where | **AI.** Place, as specific as sources allow. | Present in the description |
| Who | **AI.** The main people or groups involved, up to ~4 names. | Present in the description |
| Age | **AI.** The subject's age at the start of the event. Label it "Age", not "Her/His age"; the app knows no pronouns. | Only when the timeline follows one person's life and sources make it clear |

### How the AI fields are stored

**Decision: inside `events.description`, after the story, as `Key: value` lines.** This is the same reasoning as the TL;DR plan §3: no new column, and drafts, the viewer cache and both save paths carry it for free.

```
- Summary bullet.
- Summary bullet.

Story paragraph.

Story paragraph.

Where: Paris, in a converted shed at the School of Physics and Chemistry
Who: Marie Curie, Pierre Curie
Age: 30
```

**Why at the end and not the top: deploy skew.** The site deploys first (CLAUDE.md, "the second direction is the one that breaks production"), but a cached *old* site bundle can still meet a *new* function. The old parser treats anything before the first bullet as story, so facts at the top would push the summary into the story for those readers. At the end, the old parser just shows one extra short paragraph, which is legible and harmless. The cost is that the At-a-glance rows fill in last while text streams; they show skeleton rows until then.

**Parser.** Extend `parseEventDescription` in `src/utils/eventDescription.ts`:
- A trailing run of lines matching `^(Where|Who|Age):\s*(.+)$` (case-insensitive) becomes `facts: { where?, who?, age? }` and is removed from `paragraphs`.
- Only those three keys are accepted; anything else stays story text.
- While streaming, a half-written `Wh` line or a key with no value yet must not flash up as a paragraph. Use the same treatment as the bare bullet marker.
- Descriptions with no facts (every one written before this ships) parse exactly as today, and the AI rows are hidden.

**Prompt.** Add to `ENRICH_SYSTEM_PROMPT` in `src/services/llmPrompts.ts`, and **mirror it by hand** in `supabase/functions/enrich-event/index.ts`:
- After the description, a blank line, then up to three lines in this exact shape: `Where: …`, `Who: …`, `Age: …`.
- Leave out any line that sources don't support.
- Include `Age` only when the timeline follows one person's life.

The user prompt already passes the timeline title, which is enough for the model to judge "one person's life".

**World Events entries** go through the same prompt and get Where / Who when known. They should never have Age, so the prompt says so for context events.

## 7. What stays exactly as it is

- The state machine in `EventDetailPanel.tsx`: `idle | generating | loaded | error`, `runGeneration`, the abort controller, atomic persistence in `onDone`, Regenerate (confirmed), Remove (confirmed), retry with the other provider, and the screen-reader status line.
- The scroll pin while generating. It now applies to the page's scroll container rather than the panel's, so keep `contentRef` on the element that scrolls.
- Both mount points and their `onEventChange` routing: the World Events lane cache in both, `setCachedEvent` in the viewer, `handleUpdateEvent` in the editor.
- Edit / Delete visibility rules, and `readOnly` for World Events entries.

**What goes away:**
- The right-side panel layout and its `bg-black/50` backdrop.
- `PanelResizeHandle` on this component, and the `usePanelWidth('event_panel_width')` read. The width has no meaning full-screen. Leave the hook; other panels use it.
- The click-outside-to-close handler. Nothing is outside a full-page view; Close and Esc remain.

## 8. Accessibility

- The layer is `role="dialog"` with `aria-modal="true"` and `aria-labelledby` pointing at the title `h1`.
- Focus moves to Close when the open animation **starts**, not when it ends: it must be usable immediately. Focus is trapped inside while open and returns to the event bar (it already has `tabIndex={0}`) on close.
- The editor underneath is `inert` while open.
- Thumbnails are `<button>`s with `aria-pressed` and `aria-label` set to the caption. The counter is `aria-live="polite"`.
- Text contrast matches the current panel (labels `#9B9EA3` on `#0B0B0B` pass 4.5:1).
- Reduced motion, as specified in §4.

## 9. Edge cases

| Case | Behaviour |
|---|---|
| Event bar partly off-screen when clicked | Morph from its visible rectangle, clamped to the viewport. |
| Timeline scrolled since open (it can't be; the editor is inert) | Re-measure on close anyway. |
| Event deleted from inside the view | Close with the fallback fade (no bar to return to). |
| Edit from inside the view | Same as today: set `pendingEditEventId` and close. Close with the reverse morph, then the form opens. |
| Browser back while open | Close the view instead of leaving the route. Push a history state on open and pop it on close. |
| Phone rotated while open | Layout reflows. No animation. |
| Very long title | The title wraps; the photo column keeps its size. |
| Generation fails | The error block replaces Summary / Story as today. Photos and the When row still show. |

## 10. Files

| File | Change |
|---|---|
| `src/components/EventDetailPanel/EventDetailPanel.tsx` | New full-page layout; keep the state machine; dialog semantics; mount `useEventMorph`. Keep the export name to avoid touching both callers more than needed. |
| `src/components/EventDetailPanel/useEventMorph.ts` | **New.** Measures the bar, runs and reverses the open/close Web Animations, reduced-motion and fallback paths. |
| `src/components/EventDetailPanel/PhotoViewer.tsx` | **New.** Replaces `PhotoHeader.tsx` (delete it once nothing imports it). |
| `src/components/EventDetailPanel/AtAGlance.tsx` | **New.** The When / Where / Who / Age list, with skeleton rows while streaming. |
| `src/constants/motion.ts` | **New.** JS mirrors of `--ease-enter`, `--ease-swipe`, `--ease-pop`, plus the durations from §4. |
| `src/services/wikipediaPhotos.ts`, `src/services/eventPhotoCache.ts` | **New.** Gallery fetch and its browser cache. |
| `src/services/wikipediaImage.ts` | Lead image at 1600px. |
| `src/utils/eventDescription.ts` | Trailing `facts` block (§6). |
| `src/services/llmPrompts.ts` + `supabase/functions/enrich-event/index.ts` | Prompt addition, mirrored by hand. |
| `src/App.tsx`, `src/components/TimelineViewer/TimelineViewer.tsx` | Mark the editor or viewer content `inert` while open. Otherwise no change expected. |
| `src/TIMELINE_ARCHITECTURE.md`, `CLAUDE.md` (Docs list) | Document the event view and the animation; list this PRD. |

## 11. Deploy

1. **Site and function can ship in either order.** The new site handles both function versions (facts are optional). The old site shows the facts as a short trailing paragraph for as long as a cached bundle lives.
2. The function deploys through CI on merge (`.github/workflows/deploy-functions.yml`), because `supabase/functions/**` changes. Do not paste it into the dashboard.
3. No migration. No new CSP hosts (verify `netlify.toml` anyway). No new secrets.

## 12. Acceptance checklist

There is no test suite, so every item is checked by hand. Run `npx tsc --noEmit -p tsconfig.app.json` (10 pre-existing errors; add none) and `npm run lint`.

- [ ] Clicking an event opens the view with the morph starting from that bar's exact rectangle. Desktop and phone, edit and view mode, `/editor` and `/view/:id`.
- [ ] Close and Esc run the reverse morph into the bar's current position, and focus returns to the bar.
- [ ] Esc pressed mid-open reverses smoothly, with no jump.
- [ ] With reduced motion on, the page only crossfades.
- [ ] The timeline's scroll position and state are unchanged after closing.
- [ ] Generation starts at click time. Text streams into the page while it settles; skeletons show where nothing has arrived.
- [ ] Photos: several for a well-illustrated event, 1600px and sharp. 1 photo shows no thumbnails; 0 photos shows no frame and the one-column layout.
- [ ] Thumbnails and arrow keys (focus in viewer) change photos only, never events.
- [ ] At a glance: When always shows. Where / Who / Age show for new descriptions and are hidden for old ones. Age appears only on person timelines.
- [ ] An old description (no bullets, no facts) renders exactly as before.
- [ ] Edit, Delete, Regenerate and Remove behave as today. World Events entries show none of them.
- [ ] No previous / next event control exists anywhere in the view.
- [ ] No scrollbars visible; the page scrolls under a solid top bar.
- [ ] Production build: photos load (CSP), and nothing reports "Failed to fetch".

## 13. Open questions

1. **Full-screen photo view:** in the first release, or a fast follow?
2. **Persist the gallery** in an `events.photos` column later, so shared viewers don't refetch? Not needed for launch.
3. **Photo relevance.** `generator=images` returns everything on the page, including maps and diagrams the filter may miss. If quality is poor in testing, fall back to the lead image plus the article's infobox and gallery sections only.
4. **"Age" wording.** "Age 30" vs "Aged 30" vs "30 years old". Pick one, and use it in the prompt shape too.

## 14. As built

Built on `godin/dreamy-gauss-65s815` in three commits (layout + morph; gallery; At a glance + prompt). The mechanism is documented in `src/TIMELINE_ARCHITECTURE.md` §Event View. Where the build differs from the sections above:

- **No separate selection-ring step (§4, row 0).** The morph starts on the click itself, with no 80ms wait: the layer begins as the bar's exact rectangle and tint, so the bar lifting *is* the feedback.
- **Two columns from `lg` (1024px), not `md`.** Below that the page is one column with the photos first, on tablets as well as phones.
- **Close (§4).** The bar's tint returns only in the last half of the shrink; earlier it washed the whole screen orange. The timeline's push-back scale is dropped once the open finishes and re-applied for the close. Left on, it overhangs the viewport, and phone browsers widened the page to fit it. `<html>` is also `overflow: hidden` while the view is up.
- **Duration (§6)** is elapsed time ("July 16 – 24" is "8 days"), not inclusive days.
- **The gallery (§5) is fetched for every open**, cached events included, unless it is already in the browser cache. The persisted lead image shows until the gallery arrives.
- **Not built yet:**
  - The full-screen photo view (§5, open question 1).
  - Browser-back closing the view (§9). Back still leaves the route, exactly as it did with the side panel.

**Checked so far.** Checked in a local dev build with stand-in Wikipedia responses (this environment can't reach Wikipedia or the Supabase backend), on desktop (1440 × 900) and a phone (390 × 844):
- Open, close, Esc mid-open, and reduced motion.
- Focus moving to Close and back to the bar, and the editor made inert then restored.
- Gallery filtering and order, thumbnails, and arrow keys staying within the event.
- At a glance with and without fact lines.
- The description parser, against new, old, mid-stream and malformed text.

**Still to check live:**
- The real Wikipedia gallery quality (open question 3).
- The prompt producing fact lines with both BYOK providers and the server path.
- The CSP on production.
- The §12 checklist on a deploy preview.
