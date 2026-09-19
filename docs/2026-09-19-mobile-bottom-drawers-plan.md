# Plan: Mobile bottom drawers for Legend and Settings — 19 September 2026

**Project:** Timeline Academy
**Status:** Implemented on branch `godin/pensive-hamilton-e82m9r`. Written against `main` at `0f5b268`; built against `fe11607`. See §8 for the one deviation.

---

## 0. Context

On a phone, two editor controls behave badly:

- **The Legend** (category colour key, top-right of the nav) opens as a Radix popover. Below `md` it fakes a "sheet" by setting its width to `100vw - 32px` and letting Radix's own popper positioning land it under the trigger. It floats near the top of the screen, has no backdrop, and does not lock background scroll.
- **The Settings side panel** slides in from the right at its stored desktop width, clamped to `viewport - 64px`. On a phone that is a narrow rail with a 64px sliver of timeline peeking out to the left. It never went full-bleed the way the timelines panel and the event details panel already do.

**The change:** on mobile only (below Tailwind `md`, 768px, which is where every other panel in this app already switches layout), both controls become **drawers that slide up from the bottom edge and fill the full viewport height**. Desktop is untouched: the Legend stays an anchored popover, Settings stays a resizable right-hand rail.

First-principles framing: a drawer is just a fixed-position box whose resting place is on-screen and whose closed place is one full box-height below the screen. "Full screen height" means the box is `inset-0` (all four edges pinned to the viewport). The only things that differ between mobile and desktop are which edges are pinned and which axis the closed-state transform moves along. Tailwind's `md:` prefix expresses exactly that split in CSS with no JavaScript, **as long as no inline style fights it** — which is the one trap the codebase already documents in `GlobalLayout.tsx`.

---

## 1. What exists today (verified)

| Piece | File | Key facts |
|---|---|---|
| Legend | `src/components/Navigation/CategoryLegend.tsx` | Uncontrolled Radix `Popover` (`@/components/ui/popover`, `unstyled`). Trigger `absolute right-4 top-5 md:static`, icon-only below `md`. Content `w-[calc(100vw-32px)] md:w-[264px]`. Rows have arrow-key roving focus (`rowRefs`), `onOpenAutoFocus` → row 0, `aria-pressed` / `aria-disabled`. Comment at lines 107-111 says the popper wrapper's transform cannot be overridden from `className`. No semicolons. |
| Settings | `src/components/Settings/TimelineSettingsPanel.tsx` | Hand-rolled: `createPortal` to body, backdrop `fixed inset-0 z-40 bg-black/50`, `<aside className="fixed inset-y-0 right-0 z-50 pr-[6px] py-[6px] ... translate-x-0 / translate-x-full" style={{ width }}>`. **Inline `width` blocks any `md:` override.** Inner card `h-full w-full bg-[#171717] rounded-[6px] border border-[#262626]`. Escape closes. `PanelResizeHandle` is already `hidden md:block`. Uses semicolons. |
| Responsive-panel template | `src/components/EventDetailPanel/EventDetailPanel.tsx:117-118, 424-446` | `skipTransition = isResizing \|\| isWindowResizing`; `style={{ '--event-panel-width': width }}` + `fixed inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[var(--event-panel-width)] md:pr-[6px] md:py-[6px] z-50`, card `border-0 md:border md:border-[#262626] rounded-none md:rounded-[6px]`. This is the recipe to copy. `GlobalLayout.tsx:11-38` explains why the width must be a CSS custom property. |
| Full-screen Dialog template | `src/components/Modal/AccountDetailsModal.tsx:80-130` | Composes `Dialog`/`DialogPortal`/`DialogOverlay` from `@/components/ui/dialog` with `DialogPrimitive.Content` directly, `aria-describedby={undefined}`, `fixed z-50 inset-0 ... bg-[#171717]`, and promotes the on-screen heading to `DialogPrimitive.Title`. This is the recipe for the Legend drawer. |
| Breakpoint | `src/constants/panels.ts:31` `PANEL_RESIZE_BREAKPOINT = 768` | Matches Tailwind `md`. `tailwind.config.js` does not override `screens`. |
| Media-query hook pattern | `src/hooks/useIsNarrow.ts` | `matchMedia` at `sm` (640), SSR-safe `useState` initializer, re-sync on mount. Doc comment: prefer Tailwind prefixes; use a hook only for JS-valued decisions. |
| Window-resize hook | `src/hooks/useWindowResizing.ts` | `useSyncExternalStore` flag, true during a window drag. Panels use it to drop their transition so widths track the viewport. |
| Mobile bottom bar | `src/components/FloatingToolbar/FloatingToolbar.tsx:98` | `fixed bottom-0 ... z-30 ... pb-6 bg-black`. Drawers at `z-50` sit above it. |
| Safe area | `index.html:6` | No `viewport-fit=cover`; no `env(safe-area-inset-*)` anywhere. |
| `src/components/ui/sheet.tsx` | — | Stock shadcn Sheet. **Unused anywhere.** Left untouched by this change. |

Dependencies: `@radix-ui/react-dialog`, `@radix-ui/react-popover`, `tailwindcss-animate`. No `vaul`, no `framer-motion` — no new dependency is needed and none should be added.

---

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Breakpoint is `md` (768px). | Every panel split in the app (`GlobalLayout`, `EventDetailPanel`, `PanelResizeHandle`, Legend trigger) already switches there. Using anything else would give the Legend trigger and the Legend drawer different ideas of "mobile". |
| D2 | Settings is a pure CSS change plus one hook. No JS branch. | The panel is already a fixed `<aside>` with a transform; only the pinned edges and transform axis differ. Copy the `EventDetailPanel` recipe, including `useWindowResizing`. |
| D3 | Legend needs a JS branch: Radix `Dialog` below `md`, Radix `Popover` at `md`+. | A Radix Popover's position comes from a wrapper `div[data-radix-popper-content-wrapper]` with *inline* `position`, `top/left: 0` and `transform: translate(...)`, not reachable from the content's `className`. Forcing it to `inset-0` would need global `!important` rules under a media query that hit every popover in the app and break on any Radix change. It would also still be a non-modal layer (no focus trap, no scroll lock). A Dialog is the right primitive for a full-screen surface and brings focus trap, Escape, return-focus, `aria-modal` and body scroll lock for free. |
| D4 | Add `src/hooks/useIsMobile.ts` at `PANEL_RESIZE_BREAKPOINT`, cloned from `useIsNarrow`. | `useIsNarrow` is at 640 and its comment says it is deliberately not the panel breakpoint. Picking a component tree is a JS-valued decision, exactly the case that hook's comment reserves a hook for. Do not parameterise `useIsNarrow`; that widens the diff. |
| D5 | Compose Dialog primitives directly in `CategoryLegend`; leave `ui/sheet.tsx` alone. | `AccountDetailsModal` and `EventTableEditor` already do this for their full-screen mobile dialogs. Zero primitive edits, one fewer file touched. |
| D6 | Both drawers keep uncontrolled / existing open state. | Legend: both Radix `Popover.Trigger` and `Dialog.Trigger` set `data-state="open"` and `aria-expanded` on the trigger, so the existing open-fill CSS keeps working with no React state. Settings: `activePanel` in `App.tsx` already controls it. |
| D7 | The Legend drawer gets an explicit X close button. | A `fixed inset-0` drawer has no "outside" to tap and a phone has no Escape key. Without it the user is stuck. |
| D8 | No swipe-to-dismiss, no drag handle. | Needs a gesture library (`vaul`), a new dependency for a feature not asked for. A fake grabber with no gesture would lie. |
| D9 | Safe-area inset: leave `index.html` alone. | Without `viewport-fit=cover` the layout viewport already excludes the iOS home-indicator area, so `inset-0` never sits under it. Turning `viewport-fit=cover` on changes every fixed element app-wide. The existing mobile dialogs make the same choice. |
| D10 | Feedback panel and Event details panel are **out of scope**. | The request names Legend and Settings only. Feedback uses the byte-identical rail recipe and can take the same diff later; see §7. |

---

## 3. Implementation steps

### Step 1 — `src/hooks/useIsMobile.ts` (new, no semicolons)

Clone `useIsNarrow.ts` line for line with the breakpoint swapped: a `matchMedia` query at `(max-width: 767.98px)` — the exact complement of Tailwind's `md` — with the same SSR-safe `useState` initializer and the same re-sync on mount.

### Step 2 — `src/components/Navigation/CategoryLegend.tsx`

Keep `counts`, `visibleCount`, `rowRefs`, `totalLabel`, `toggle`, `handleRowKeyDown` unchanged. Then:

1. **Hoist the trigger** into a local `const trigger = (<button ...>)` with today's classes and children, so it can be passed to either `PopoverTrigger asChild` or `DialogTrigger asChild`.
2. **Hoist the rows** into a local `const rows = (<div className="flex flex-col gap-[2px]">{categories.map(...)}</div>)` — markup unchanged. Locals, not new exported components, so `react-refresh/only-export-components` stays quiet and `rowRefs` stays in closure.
3. **Shared focus handler:** `const focusFirstRow = (e: Event) => { e.preventDefault(); rowRefs.current[0]?.focus() }` — the type matches both Radix `onOpenAutoFocus` signatures.
4. **Branch on `useIsMobile()`.** Below `md`: `Dialog` → `DialogPortal` → `DialogOverlay className="bg-black/50"` + `DialogPrimitive.Content` at `fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#171717]`, sliding with `data-[state=open]:slide-in-from-bottom` / `data-[state=closed]:slide-out-to-bottom` at an inline `animationDuration: '300ms'`. Header row carries a `DialogPrimitive.Title` ("Categories"), the event count and a `DialogPrimitive.Close` X; the rows go in a `flex-1 min-h-0 overflow-y-auto p-2`. At `md`+: the existing `Popover`, with `w-[calc(100vw-32px)] md:w-[264px]` collapsed to `w-[264px]` and the bg/shadow pairs collapsed to their `md:` values.

Notes:
- `slide-in-from-bottom` / `slide-out-to-bottom` (tailwindcss-animate) are `translateY(100%)` ↔ 0. On an `inset-0` box that is a full-height rise from the bottom edge. `ease-out` sets `animation-timing-function` under tailwindcss-animate.
- `DialogOverlay` defaults to `bg-black/80`; pass `bg-black/50` for the repo's backdrop tone. It is covered by the content once open, but carries the fade and is the click target during the slide.
- No `role`/`aria-label` on the content: the Title names the dialog. `aria-describedby={undefined}` silences Radix's missing-description warning, as `AccountDetailsModal.tsx:117` does.
- Delete the now-false comment at lines 107-111 about faking a sheet with popover width. The popover branch is desktop-only now.
- Row classes `min-h-[44px] py-[12px] md:min-h-0 md:py-[8px]` stay as they are: only the mobile side applies inside the Dialog, only the `md` side inside the Popover.
- Escape, focus trap, return-focus-to-trigger and body scroll lock all come from Dialog. Do not add a second Escape handler.

### Step 3 — `src/components/Settings/TimelineSettingsPanel.tsx` (semicolons in this file)

1. Import `useWindowResizing` and derive `const skipTransition = isResizing || isWindowResizing;`. Why: the closed position now differs per breakpoint (below the screen on mobile, off the right edge on desktop). Without the skip, a window drag across 768px while closed would tween the panel diagonally through the visible bottom-right corner for 300ms. `EventDetailPanel.tsx:117-118` does the same.
2. Replace the `<aside>`: width travels as `--settings-panel-width` rather than an inline `width`; classes become `fixed inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[var(--settings-panel-width)] md:pr-[6px] md:py-[6px] z-50`, open is `translate-x-0 translate-y-0`, closed is `translate-y-full md:translate-y-0 md:translate-x-full`. Tailwind v3 writes `translate-x-*` and `translate-y-*` into separate `--tw-translate-x` / `--tw-translate-y` variables composed into one `transform`, and both default to 0. So closed-mobile = `translate(0, 100%)`, closed-desktop = `translate(100%, 0)`, open = `translate(0, 0)`. `translate-y-full` on an `inset-0` element is 100% of the viewport height — fully offscreen.
3. Inner card: `h-full w-full bg-[#171717] flex flex-col overflow-hidden border-0 md:border md:border-[#262626] rounded-none md:rounded-[6px]`.
4. Nothing else changes: backdrop, Escape handler, portal, header + X, `PanelResizeHandle` (`hidden md:block`), scroll container.

### Step 4 — `src/constants/panels.ts` comment only

The `MIN_CONTENT_GUTTER` doc comment says the gutter "applies to Settings and Feedback, which stay narrow rails at every width." After this change only Feedback does. One-sentence edit; the clamp still runs but Settings ignores its width below `md`, like the left and event panels.

### Step 5 — commit the plan

Copy this file to `docs/2026-09-19-mobile-bottom-drawers-plan.md` in the same commit as the code, matching the other dated docs there.

---

## 4. Files touched

| File | Change |
|---|---|
| `src/hooks/useIsMobile.ts` | **New.** `md`-breakpoint media-query hook. |
| `src/components/Navigation/CategoryLegend.tsx` | Branch on `useIsMobile()`: full-screen Dialog below `md`, Popover at `md`+. Hoist trigger and rows. |
| `src/components/Settings/TimelineSettingsPanel.tsx` | `<aside>` + card classes; width → custom property; `useWindowResizing`. |
| `src/constants/panels.ts` | Comment only. |
| `docs/2026-09-19-mobile-bottom-drawers-plan.md` | This plan. |

Not touched: `Header.tsx`, `App.tsx`, `GlobalNav.tsx`, `FloatingToolbar.tsx`, `ui/sheet.tsx`, `ui/dialog.tsx`, `index.html`, `package.json`.

---

## 5. Risks and gotchas

- **Desktop drift is limited to two no-ops:** the popover loses its `w-[calc(100vw-32px)]` branch (invisible at `md`+) and Settings gains `translate-y-0` (already 0). The 1280×800 pass in §6 confirms.
- **Legend closes on a breakpoint crossing while open.** Intentional and documented in the code comment. Radix releases the Dialog's scroll lock on unmount, so nothing sticks.
- **`asChild` on two Radix roots.** Only one tree is mounted at a time, so the shared `trigger` JSX has no duplicate-ref issue.
- **Radix Dialog side effects.** While open it sets `aria-hidden` on the portal's siblings and `pointer-events: none` on body. Correct for a full-screen drawer; released on close.
- **z-order.** Settings backdrop `z-40`, drawer `z-50`; Legend overlay + content `z-50`, portalled last. Both cover the mobile toolbar (`z-30`), the left panel (`z-40`) and the nav trigger (`z-10`). `ConfirmationModal` (Delete Timeline) is its own `z-50` fixed layer rendered after the portal, so it stacks above the Settings drawer — check in the mobile pass.
- **`h-full` inside `inset-0`.** The `<aside>` takes its height from `top:0; bottom:0`, so the card's `h-full` resolves — the same chain `EventDetailPanel` relies on.
- **Strict TypeScript.** `noUnusedLocals` will reject the hoisted `trigger`/`rows` if either branch forgets them, and the `Popover` imports must remain used.

---

## 6. Verification (manual — no test framework)

1. `npm run lint` and `npm run build` pass clean.
2. `npm run dev`, open `/editor` with a timeline that has ≥3 categories and a description.
3. **Phone width** (390×844 and narrower — all under 768):
   - Tap the dots button top-right. The Legend rises from the bottom edge over ~300ms and fills the viewport. Header shows "Categories", the event count and an X. Focus lands on row 0; arrow keys / Home / End cycle rows; the last visible category cannot be hidden. Toggle a category, close, and confirm its events hid on the timeline. X and Escape close it with a downward slide; focus returns to the trigger and the trigger's open fill clears. The page behind does not scroll while it is open.
   - Tap Settings in the bottom bar. The drawer rises from the bottom, no gap on any edge, square corners, no border, no resize handle. Description, scale, row height, group-by, API key section and the three action buttons are all reachable by scrolling. X, backdrop tap and Escape close it downward. Delete Timeline opens its confirmation above the drawer.
4. **Desktop width** (1280×800, and exactly 768):
   - Legend opens as the anchored 264px popover under the trigger with the 120ms fade, identical to `main`.
   - Settings slides in from the right at the stored width with the 6px gap and rounded card; the resize handle drags, double-click resets, width persists on reload — identical to `main`.
5. **Resize sweeps:** with Settings closed, drag the window 1300 → 700 → 1300; no ghost panel sweeps through the corner. Open the Legend at 1280 and narrow past 768: it closes cleanly; widen back and it reopens as the popover.
6. **Reduced motion** (DevTools → Rendering → `prefers-reduced-motion: reduce`): both drawers appear and disappear without sliding.
7. iOS Safari on a device or simulator, if available: the drawer bottom is not obscured by the home indicator with the default viewport meta.

---

## 7. Follow-ups (not in this change)

- `FeedbackPanel.tsx` uses the identical right-rail recipe and can take the same `<aside>` diff as Step 3.
- `EventDetailPanel.tsx` is already full-screen on mobile but slides from the right; making it rise from the bottom is the same transform swap.
- `ui/sheet.tsx` is unused and could be deleted in a cleanup commit.
- Swipe-to-dismiss would need `vaul` or a pointer handler; decide separately.
- `viewport-fit=cover` + safe-area padding is an app-wide decision.
- **`motion-reduce:animate-none` is inert everywhere else it appears** — see §8. `AccountDetailsModal`, `EventTableEditor` and `ui/dialog.tsx` all carry Radix `data-[state=…]` animation utilities, and wherever they pair one with a bare `motion-reduce:animate-none` the guard loses on specificity. Worth a sweep in its own commit.

---

## 8. Implementation notes — one deviation from the plan

§6 step 6 asked for both drawers to be motion-free under `prefers-reduced-motion: reduce`. Settings passed as written. **The Legend drawer did not**, and neither did the popover it was copied from — on `main`.

The cause is pure CSS specificity, and the plan missed it. Tailwind compiles `data-[state=open]:animate-in` to

```css
.data-\[state\=open\]\:animate-in[data-state=open] { animation-name: enter; … }
```

— a class *plus* an attribute selector, specificity (0,2,0). The guard compiles to

```css
@media (prefers-reduced-motion: reduce) { .motion-reduce\:animate-none { animation: none } }
```

— one class, (0,1,0). A media query contributes no specificity of its own, so `animate-in` wins and the slide plays regardless of the user's preference. Measured in Chromium with `prefers-reduced-motion: reduce` emulated: `getComputedStyle(content).animationName === 'enter'`, drawer caught mid-slide at `y = 358` of an 844px viewport.

The fix is to give the guard the same attribute, so it matches specificity and then wins on source order (Tailwind emits the `motion-reduce` layer last):

```
motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none
```

Applied to both branches in `CategoryLegend.tsx` — the new drawer and the popover, since the popover's guard was equally inert and the file was open. Re-measured: `animationName === 'none'` and the surface is in place at frame 0 in both branches, while the un-emulated run still reports `enter` on open and `exit` on close. Everything outside this file was left alone; §7 records the sweep.

Verified in headless Chromium against `npm run dev`, with a seeded trial draft:

| Check | Result |
|---|---|
| Settings box at 390×844, open | `{x:0, y:0, w:390, h:844}` — full bleed |
| Settings box at 1280×800, open | `{x:920, y:0, w:360, h:800}` — unchanged right rail |
| Settings closed transform below `md` | `matrix(1,0,0,1,0,844)` — one viewport height down |
| Settings closed transform at `md`+ | `matrix(1,0,0,1,326,0)` — off the right edge |
| Legend drawer, focus on open / after ↓ / after Escape | row 0 → row 1 → trigger |
| `document.body` overflow while drawer open / at `md`+ | `hidden` / `visible` |
| Breakpoint crossing at 768 with drawer open | dialog unmounts, scroll lock and `pointer-events` released |
| Delete Timeline confirmation over the mobile drawer | `ConfirmationModal` is the hit-tested element at viewport centre |
| Closed-panel on-screen area over a 1300→700→1300 sweep | 0px² — no ghost |
| Popover at 1280×800 | anchored, 264px wide, at `x:904 y:63` |

Step 4's comment edit went slightly further than "one sentence": the gutter now applies to Feedback alone, and three panels rather than two ignore their stored width below the breakpoint, so the paragraph names all three.
