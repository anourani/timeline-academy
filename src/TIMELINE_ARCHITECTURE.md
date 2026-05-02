# Timeline Architecture

> **Living documentation** of how the timeline page works.
>
> **Maintenance contract:** any PR that changes timeline rendering, layout, scaling, stacking, scrolling, drag, modes, or persistence must update this doc in the same PR. If the doc and the code disagree, **the code is correct and the doc is a bug** — open a follow-up PR to fix the doc.
>
> **Source of truth:** `src/components/Timeline/Timeline.tsx` and the files it imports. Constants live in `src/constants/`, types in `src/types/`, hooks in `src/hooks/`.

---

## Table of Contents

1. [Component Hierarchy](#component-hierarchy)
2. [Data Model](#data-model)
3. [Layout System](#layout-system)
4. [Grouping Modes](#grouping-modes)
5. [Edit / View Modes](#edit--view-modes)
6. [Grid System](#grid-system)
7. [Header (Year & Month Labels)](#header-year--month-labels)
8. [Scroll Indicator](#scroll-indicator)
9. [Vertical Lines](#vertical-lines)
10. [Category Labels](#category-labels)
11. [Event Rendering](#event-rendering)
12. [Event Stacking Algorithm](#event-stacking-algorithm)
13. [Band Height Calculation](#band-height-calculation)
14. [Drag-and-Drop System](#drag-and-drop-system)
15. [Wheel → Horizontal Scroll](#wheel--horizontal-scroll)
16. [Scroll-to-Date](#scroll-to-date)
17. [Add-Event Cursor](#add-event-cursor)
18. [Event Actions Menu](#event-actions-menu)
19. [Event Form Dialog](#event-form-dialog)
20. [Scale / Zoom System](#scale--zoom-system)
21. [Date-to-Grid Math](#date-to-grid-math)
22. [Timeline Range Calculation](#timeline-range-calculation)
23. [Data Flow & Persistence](#data-flow--persistence)
24. [Key Constants](#key-constants)
25. [Hook Reference](#hook-reference)

---

## Component Hierarchy

`Timeline.tsx` is the top-level orchestrator. It renders the following tree (children marked _conditional_ render only when the noted predicate is true):

```
Timeline
├── TimelineCategoryLabels                ─ conditional: groupByCategory
│                                           (overlay, absolute, top = SCROLL_INDICATOR_HEIGHT + HEADER_HEIGHT)
├── inner column wrapper
│   ├── TimelineScrollIndicator
│   └── scroll container (overflow-auto, scrollbar-hide)
│       └── timeline-grid wrapper
│           ├── TimelineHeader
│           │   ├── TimelineYearLabels
│           │   └── TimelineMonthLabels
│           ├── body column
│           │   ├── TimelineVerticalLines
│           │   ├── layout.bands.map(band)               ─ 1 band by default; N bands when groupByCategory
│           │   │   ├── TimelineGrid                     ─ interaction overlay sized to the band
│           │   │   └── TimelineEvent[]                  ─ events placed into the band's CSS Grid
│           │   └── filler column
│           │       └── TimelineGrid                     ─ fills remaining vertical space below events
│           └── Add-Event Cursor                         ─ conditional: hoveredMonth !== null
│                                                         && isEditing && onAddEvent && !dragState.isDragging
├── EventActionsMenu                       ─ conditional: menuState (event clicked in edit mode)
└── Dialog (shadcn) > EventForm            ─ conditional: showEventModal
```

`TimelineCategoryLabels` and the `Dialog` are siblings of the scroll-container subtree, not children of it. The category-labels overlay is positioned absolutely to align with the bands while staying outside the horizontal scroll.

---

## Data Model

```ts
// src/types/timeline.ts
interface Month {
  year: number
  month: number    // 0-indexed (0 = January)
}

interface Timeline {
  id: string
  title: string
  updated_at: string | null
  user_id: string
  scale: 'large' | 'medium' | 'small'
}

interface TimelineScale {
  value: 'large' | 'medium' | 'small'
  monthWidth: number
  quarterWidth: number
}
```

```ts
// src/types/event.ts
interface EventSource {
  title: string
  url: string
}

interface TimelineEvent {
  id: string
  title: string
  startDate: string                  // ISO YYYY-MM-DD
  endDate: string                    // ISO YYYY-MM-DD
  category: TimelineCategory
  // AI-generated detail fields. Populated only after the user opens
  // "Open details" on an event in edit mode and the enrichment completes.
  description?: string | null
  imageUrl?: string | null
  imageAttribution?: string | null
  sources?: EventSource[] | null
}

type TimelineCategory = 'category_1' | 'category_2' | 'category_3' | 'category_4'

interface CategoryConfig {
  id: TimelineCategory
  label: string
  color: string
  visible: boolean
}
```

```ts
// src/utils/eventStacking.ts
interface StackedEvent extends TimelineEvent {
  stackIndex: number   // Vertical row index within the band (0-based)
}
```

---

## Layout System

The root element switches between two outer modes based on `isFullScreen`:

```tsx
isFullScreen
  ? 'h-[calc(100vh-6rem)] relative'
  : 'flex-1 min-h-0 flex flex-col relative'
```

Inside the root, the page is a vertical stack:

1. `TimelineScrollIndicator` — height `SCROLL_INDICATOR_HEIGHT` (36px), in normal flow at the top.
2. Scroll container (`overflow-auto scrollbar-hide`).
   - Inside, the `timeline-grid` wrapper has `min-width: months.length * scale.monthWidth` and `min-height: 100%`.
   - First child is `TimelineHeader` (year + month labels, total 64px tall).
   - Below that is the body column, which contains `TimelineVerticalLines`, the layout bands, and a `flex-1` filler.

When `groupByCategory` is true, a separate `TimelineCategoryLabels` overlay is rendered as the first child of the root, with `position: absolute; left: 0; z-10; pointer-events: none` and `top: SCROLL_INDICATOR_HEIGHT + HEADER_HEIGHT` (= 100px). Its height matches `layout.totalHeight`. The overlay sits outside the horizontal scroll container, so it stays pinned to the left edge as the user scrolls horizontally.

---

## Grouping Modes

Controlled by the `groupByCategory` prop on `Timeline.tsx`. State lives in `useGroupByCategory` and is persisted on the `timelines.group_by_category` column via `useAutosave`.

| `groupByCategory` | Bands | Row height | Category labels |
|---|---|---|---|
| `false` (default) | One band containing every visible event, stacked together. | `EVENT_ROW_HEIGHT` (38px) | Hidden |
| `true` | One band per visible category, in `visibleCategories` order. Each band runs its own stacking pass. | `EVENT_HEIGHT` (36px) | Rendered as the absolute overlay (see §3) |

In grouped mode, each `TimelineEvent` receives `categoryOffset = band.offset` so the event renders at the correct vertical position within the overall body. In default mode, all events share `offset = 0`.

---

## Edit / View Modes

The `mode` prop is `'edit' | 'view'` and defaults to `'edit'`. `Timeline.tsx` derives `const isEditing = mode === 'edit'`.

| Affordance | Edit mode | View mode |
|---|---|---|
| Drag-to-reschedule | Enabled (`onPointerDown` is wired only when `isEditing && onUpdateEvent`). | Suppressed. |
| Add-Event Cursor (hover band) | Rendered when `onAddEvent` is provided. | Not rendered. |
| Click on event | Opens `EventActionsMenu` at the click position. | Calls `onOpenDetails(event)`. |
| Click on a month cell | Opens the `EventForm` Dialog seeded with that month's first day. | No-op (`handleMonthClick` returns early). |

---

## Grid System

Two CSS Grids run in parallel:

**Header (`TimelineHeader`)** — one column per month:

```css
grid-template-columns: repeat(${months.length}, ${scale.monthWidth}px);
```

**Each body band** — one column per quarter (4× as many columns as months), with rows derived from stack index:

```css
grid-template-columns: repeat(${months.length * 4}, ${scale.quarterWidth}px);
grid-auto-rows:       ${rowHeight}px;
gap:                  0;
```

Where `rowHeight` is `EVENT_HEIGHT` when `groupByCategory` is true, else `EVENT_ROW_HEIGHT`. Events are placed into a band via `gridColumn: ${startColumn} / ${endColumn}` and `gridRow: ${stackIndex + 1}`.

---

## Header (Year & Month Labels)

`TimelineHeader` is a CSS Grid with one column per month; it composes `TimelineYearLabels` and `TimelineMonthLabels`.

### `TimelineYearLabels.tsx`

- Spans the full grid: `gridColumn: 1 / span ${months.length}`, `display: flex`.
- Container: `border-l border-line-default relative h-8 transition-[width] duration-200 ease-in-out`.
- One inner div per year, width = `monthsInYear × scale.monthWidth`, `border-r border-line-year-boundary`, `shrink-0`.
- Year text: `text-sm text-[#9b9ea3] text-center font-mono`.

### `TimelineMonthLabels.tsx`

- Container: `border-l border-line-default`, with its own grid: `repeat(${months.length}, ${scale.monthWidth}px)`.
- Each month cell: `border-r ${getMonthBorderClass(month)}` (where `getMonthBorderClass` returns `border-line-year-boundary` for December and `border-line-default` otherwise), `flex items-center justify-center h-8`.
- Month abbreviation text only renders when `scale.value === 'large'`:
  ```tsx
  {scale.value === 'large' && (
    <span className="text-[10px] text-[#9b9ea3] font-mono ...">
      {format(new Date(month.year, month.month), 'MMM')}
    </span>
  )}
  ```
  At `small` scale the cell is empty (vertical borders only).

---

## Scroll Indicator

`TimelineScrollIndicator.tsx` is a single year label rendered in normal flow at the top of the timeline column. It is **not** an absolutely-positioned vertical bar.

```tsx
<div
  className="flex items-start px-[24px] pointer-events-none font-mono text-[24px] text-[#9b9ea3] whitespace-nowrap"
  style={{ height: SCROLL_INDICATOR_HEIGHT }}
>
  {leftYear != null && <span>{leftYear}</span>}
</div>
```

The displayed year is `months[Math.max(0, Math.floor(visibleRange.start / 4))]?.year`, where `visibleRange.start` comes from `useTimelineScroll` and is expressed in quarter-columns. `Math.floor(... / 4)` converts back to a month index.

---

## Vertical Lines

`TimelineVerticalLines.tsx` overlays a vertical line at every month boundary plus a trailing edge. The component is `aria-hidden`, `pointer-events-none`, and absolute-positioned to fill its parent.

For each month index `i`, a `<span>` is placed at `left: i * scale.monthWidth` with class `bg-line-year-boundary` if its left-side neighbor is December, else `bg-line-default`. A trailing `<span>` is placed at `left: months.length * scale.monthWidth`.

Reveal animation: an `IntersectionObserver` rooted on the scroll container marks each line `data-revealed="true"` the first time it intersects the viewport (the CSS for `.timeline-vertical-line[data-revealed]` handles the reveal). When `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, every line is revealed immediately and the observer is skipped.

The observer effect re-runs only when the months range key (`first..last`) or the scroll container ref changes — scale changes are handled by CSS transitions, not a new observer.

---

## Category Labels

`TimelineCategoryLabels.tsx` renders the per-category pill labels that align with each band when `groupByCategory` is true.

```tsx
<div className="relative h-full">
  {categories.map(cat => (
    <div className="flex items-start pt-2 pl-6" style={{ height: `${cat.height}px` }}>
      <div
        className="rounded-[4px] p-2 backdrop-blur-[2px] leading-none"
        style={{ backgroundColor: `${color}4D` }}
      >
        <span className="label-small-allcaps whitespace-nowrap">{label}</span>
      </div>
    </div>
  ))}
</div>
```

The `4D` suffix is the alpha byte (~30%) appended to the category color. The component receives a `categories: { id, height }[]` array (from `layout.bands`) plus the full `customCategories` list to look up label and color. It is rendered only when `groupByCategory` is true, inside the absolute overlay described in §3.

---

## Event Rendering

`TimelineEvent.tsx` is a `React.memo` wrapper that places one event into its band's CSS Grid.

### Positioning

```ts
gridColumn: `${startColumn} / ${endColumn}`
gridRow:    event.stackIndex + 1
minWidth:   EVENT_MIN_WIDTH (120px)
height:     EVENT_ROW_HEIGHT (38px)
zIndex:     isDragging ? 1000 : event.stackIndex + 1
```

`startColumn` / `endColumn` are derived from the event's start and end dates via the date-to-grid math in §21.

### Visual styling

- **Multi-day event:** inner content has `backgroundColor: ${categoryColor}73` (color with `73` alpha), an 8px-wide accent bar in the solid category color on the left, and the title in `body-lg`.
- **Single-day event** (`startDate === endDate`): inner content has `backgroundColor: 'transparent'` — only the 8px accent bar is visible, with the title beside it.
- **Hover:** `hover:brightness-110 transition-colors hover:text-text-primary`.
- **Cursor:** `grab` when draggable and idle, `grabbing` while dragging, `pointer` when only clickable (e.g. view mode).

### Drag visuals

When `isDragging` is true:

```ts
transform:  `translateX(${dragDeltaPixels}px) scale(1.04)`
boxShadow:  '0 8px 24px rgba(0, 0, 0, 0.45)'
opacity:    0.92
zIndex:     1000
transition: 'box-shadow 150ms ease, opacity 150ms ease'
```

A second element renders at the original `gridColumn`/`gridRow` with `opacity: 0.3` and `pointer-events: none` — the **ghost placeholder** that holds the slot until the drag ends.

### Stack-reflow animation (FLIP)

When `event.stackIndex` changes between renders (e.g. after a drag, an add, or a delete causes other events to re-stack), the component runs a 220ms FLIP animation:

1. `useLayoutEffect` detects the stack change, computes `delta = (prevStack - newStack) * rowHeight`, sets phase `'jumping'` with `transform: translateY(delta)` and `transition: 'none'`.
2. After two RAFs, phase flips to `'animating'` with `transform: translateY(0)` and `transition: transform 220ms ease`.
3. `onTransitionEnd` returns the phase to `'idle'`.

Drag transforms take priority over FLIP transforms — the dragged event is excluded from FLIP and animates separately via its own drag styles.

### Mount callback

`onMounted(eventId, node)` is called from a ref callback. `Timeline.tsx` uses it to detect when a freshly-added event has rendered, then calls `node.scrollIntoView` to bring it into view. See §16 Scroll-to-Date.

---

## Event Stacking Algorithm

`src/utils/eventStacking.ts` exports `calculateEventStacks(events, months, monthWidth) → StackedEvent[]`.

### Inputs and outputs

- **Input:** the events for one band, the month range, and the active `monthWidth`.
- **Output:** the same events with a `stackIndex: number` assigned (0-based row within the band).

### Algorithm

1. **Sort** events by `startDate` ascending (stable; same-start events keep their original order).
2. For each event:
   - Compute `startColumn` and `endColumn` from the start/end month indices.
   - Compute the title's required pixel width via canvas-based `measureTextWidth`, rounded up to whole columns:
     ```ts
     displayPx  = max(EVENT_MIN_WIDTH, textPx + TITLE_CHROME_WIDTH)
     requiredPx = displayPx + TRAILING_BUFFER_PX
     requiredColumns = ceil(requiredPx / monthWidth)
     ```
   - Compute `visualEndColumn = max(endColumn, startColumn + requiredColumns - 1)`. This guarantees the title's pixel footprint is honored even when the date range is narrow (e.g. a single-day event with a long title).
   - **First-fit:** starting from `stackIndex = 0`, find the first row where the new placement does not overlap any existing placement. Two placements collide iff:
     ```ts
     existing.stackIndex === new.stackIndex
       && new.startColumn <= existing.visualEndColumn
       && existing.startColumn <= new.visualEndColumn
     ```

### Text measurement

```ts
TITLE_FONT          = '400 16px Avenir, sans-serif'
TITLE_CHROME_WIDTH  = 20   // pixels: outer 2px + inner 2px + 8px accent + 4px padding + 2px + 2px
TRAILING_BUFFER_PX  = 24   // empty space reserved after each event so adjacent same-row events don't visually touch
```

`measureTextWidth` lazily creates a 2D canvas context and caches it in module-level state. When `typeof document === 'undefined'` (SSR / non-browser), it falls back to `text.length * 8` pixels.

---

## Band Height Calculation

Band heights are computed inline in `Timeline.tsx`'s `layout` `useMemo` (no separate hook).

**`groupByCategory: true`** — one band per visible category:

```ts
maxStack = max(stackedEvents.stackIndex, 0)
height   = max((maxStack + 1) * EVENT_HEIGHT + CATEGORY_PADDING, CATEGORY_MIN_HEIGHT)
```

Bands are stacked vertically; each band records its `offset` (sum of prior heights) so events know where their band starts.

**`groupByCategory: false`** — single band containing every visible event:

```ts
maxStack = max(stackedEvents.stackIndex, 0)
height   = stackedEvents.length === 0
            ? EVENT_ROW_HEIGHT
            : (maxStack + 1) * EVENT_ROW_HEIGHT + CATEGORY_PADDING
```

`layout.totalHeight` sums the band heights and is used to size the category-labels overlay in grouped mode.

---

## Drag-and-Drop System

`useEventDrag(scale, scrollContainerRef, onDragEnd) → { dragState, handlePointerDown, justDraggedRef }`.

### Flow

1. **`handlePointerDown(eventId, e)`** — only the primary button (`e.button === 0`) starts a drag. Records start client X and the scroll container's `scrollLeft`. Attaches window listeners for `pointermove`, `pointerup`, `pointercancel`, and `blur`.
2. **`handlePointerMove(e)`** — computes `deltaPixels = (e.clientX - startX) + (currentScrollLeft - startScrollLeft)`, so simultaneously scrolling the container during a drag is accounted for. Until `|deltaPixels| > DRAG_THRESHOLD` (5px), no drag state is published — the pointer is treated as a potential click. Once the threshold is crossed, `deltaQuarters = round(deltaPixels / scale.quarterWidth)` is published; `dragState.deltaPixels` is then snapped to `deltaQuarters * quarterWidth` so the dragged event quantizes visually to grid columns.
3. **`handlePointerUp`** — if a drag actually started, sets `justDraggedRef.current = true` for one rAF (so the next click on the event or the grid is suppressed) and calls `onDragEnd(eventId, lastDeltaQuarters)` when the delta is non-zero. All listeners are removed.

### `Timeline.tsx`'s `handleDragEnd`

```ts
const { startDate, endDate } = shiftEventDates(event, deltaQuarters)
onUpdateEvent({ ...event, startDate, endDate })
```

`shiftEventDates` (in `src/utils/dateUtils.ts`) shifts both dates by `deltaQuarters * 7` days, preserving exact duration.

### Anti-click guard

`justDraggedRef` is also consulted by `handleMonthClick` and `handleEventClick` so that the click event the browser emits at the end of a drag does not fire month-creation or open the actions menu.

---

## Wheel → Horizontal Scroll

A `useEffect` in `Timeline.tsx` attaches a non-passive `wheel` listener to the scroll container that translates vertical wheel motion into smooth horizontal scroll.

- Skip the translation (let native vertical scroll proceed) when `e.ctrlKey || e.metaKey` (browser zoom), when `|e.deltaX| > |e.deltaY|` (predominantly-horizontal wheel, e.g. trackpad sideways), or when `e.deltaY === 0`.
- Normalize `deltaMode`: `1` (line) → multiply by `16`; `2` (page) → multiply by `el.clientHeight`; `0` (pixel) → use `e.deltaY` directly.
- Maintain a `target` scroll position; clamp it to `[0, scrollWidth - clientWidth]`.
- A `requestAnimationFrame` step lerps the actual `el.scrollLeft` toward `target` with factor **`0.18`** per frame, snapping when within `0.5px` of target.

The listener is scoped to the scroll container ref, so wheel events inside side panels and dialogs (rendered outside this subtree) keep their native vertical scroll.

---

## Scroll-to-Date

`scrollToDate(dateStr)` is defined in `Timeline.tsx`:

```ts
const monthIndex   = months.findIndex(m => m.year === year && m.month === month - 1)
const pixelOffset  = monthIndex * scale.monthWidth
const viewportWidth = scrollContainerRef.current.clientWidth
const targetLeft   = pixelOffset - (viewportWidth / 2) + (scale.monthWidth / 2)
scrollContainerRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' })
```

It centers the requested month within the viewport.

### Entry points

1. **`pendingScrollDate` prop.** Used by `EventTableEditor` after a bulk add. A `useEffect` runs `scrollToDate(pendingScrollDate)` inside `requestAnimationFrame` and then calls `onScrollComplete?.()` so the parent can clear its pending state.
2. **`handleSubmit` after add/edit.** After dismissing the dialog, `scrollToDate(eventData.startDate)` runs in a rAF. For a newly-created event, the event's `id` is stashed in `pendingScrollEventId` so that when its DOM node mounts, `handleEventMounted` can call `node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })`. `scrollIntoView` handles vertical alignment; horizontal alignment is handled by `scrollToDate`.

---

## Add-Event Cursor

A translucent vertical band that follows the user's hovered month while the timeline is in edit mode.

```tsx
{hoveredMonth !== null && isEditing && onAddEvent && !dragState.isDragging && (
  <div
    className="absolute top-[64px] bottom-0 bg-[#FBFBFB]/25 pointer-events-none transition-transform duration-75 ease-out"
    style={{
      transform: `translateX(${hoveredMonth * scale.monthWidth}px)`,
      width: `${scale.monthWidth}px`,
    }}
  />
)}
```

- `hoveredMonth` is set by `TimelineGrid`'s `onMouseEnter` / `onMouseLeave` (per-month).
- `top-[64px]` aligns the band's top with the bottom of the header (= `HEADER_HEIGHT`).
- The band is hidden in view mode, when no `onAddEvent` prop is provided, and during drag.

---

## Event Actions Menu

`EventActionsMenu.tsx` is a portal-mounted floating menu shown when an event is clicked in edit mode.

- Triggered by `handleEventClick(event, { x: e.clientX, y: e.clientY })` in `Timeline.tsx`. The menu is rendered when `menuState !== null`.
- Position: `fixed; left: x; top: y` initially, then a `useLayoutEffect` flips horizontally / vertically to keep the menu inside the viewport (8px margin).
- Three items:
  1. **Edit event** → calls `onEdit`, which sets `editingEvent` and opens the `EventForm` Dialog.
  2. **Open details** → calls `onOpenDetails(event)` (handed up to the page, which opens the side panel).
  3. **Delete** → calls `onDeleteEvent(event.id)`. Styled `destructive`.
- An invisible full-viewport click-catcher (`fixed inset-0 z-[999]`) sits behind the menu and absorbs `mousedown` to close, preventing the underlying timeline grid from receiving a click that would otherwise create a new event.
- Closes on `Escape` (via a window `keydown` listener) and on outside `mousedown`/`contextmenu`.

---

## Event Form Dialog

`Timeline.tsx` renders shadcn's `Dialog` from `@/components/ui/dialog`:

```tsx
<DialogContent
  className="bg-surface-secondary border-[rgba(210,210,210,0.15)] max-w-[360px] rounded-[20px] px-5 py-6"
>
  <DialogHeader>
    <DialogTitle className="header-small text-[#c9ced4] text-center">
      {editingEvent ? 'Edit Event' : 'Add Event'}
    </DialogTitle>
  </DialogHeader>
  <EventForm
    onSubmit={handleSubmit}
    categories={visibleCategories}
    initialStartDate={selectedDate}
    initialEvent={editingEvent}
  />
</DialogContent>
```

`handleSubmit` calls `onUpdateEvent` (when `editingEvent` is set) or `onAddEvent` (otherwise), closes the modal, queues a smooth `scrollToDate(eventData.startDate)`, and (for adds) sets `pendingScrollEventId` so the new event's mount callback can `scrollIntoView`.

`EventForm` handles its own state: title (max 55 chars), category (single-select pill grid of `visibleCategories`), and `startDate`/`endDate` (text input with calendar popover; end date is optional and falls back to start date on submit).

---

## Scale / Zoom System

Three scales live in `src/constants/scales.ts`:

| `value` | `monthWidth` | `quarterWidth` |
|---|---|---|
| `large` | `28` | `7` |
| `medium` | `20` | `5` |
| `small` | `12` | `3` |

`useTimelineScale(initialScale = 'medium')` holds the active scale and exposes `currentScale` (the full `TimelineScale` object). The selected scale is persisted to `timelines.scale` (`'large' | 'medium' | 'small'`) by `useAutosave`.

Switching scale recalculates all event positions: the grid math (§21) is unchanged but the pixel widths differ. CSS transitions on `min-width`, `grid-template-columns`, and span positions animate the change. Month abbreviations only render at `large` scale (see §7).

---

## Date-to-Grid Math

```
monthIndex   = months.findIndex(m => m.year === date.year && m.month === date.month - 1)
quarterIndex = Math.floor((day - 1) / 8)
                 // Day  1– 8 → 0
                 // Day  9–16 → 1
                 // Day 17–24 → 2
                 // Day 25–31 → 3

startColumn  = monthIndex * 4 + quarterIndex + 1     // CSS Grid is 1-indexed
endColumn    = endMonthIndex * 4 + endQuarter + 2    // exclusive end for `gridColumn: start / end`
pixelX       = (column - 1) * scale.quarterWidth
```

**Reverse (drag delta → date shift):**

```
deltaQuarters = Math.round(deltaPixels / scale.quarterWidth)
daysDelta     = deltaQuarters * 7
```

Each quarter represents ~7 days. The mapping is approximate but visually consistent across all events at all scales.

---

## Timeline Range Calculation

`getTimelineRange(events)` in `src/utils/dateUtils.ts` decides which months to render.

```
1. If events is empty:
     [DEFAULT_START_YEAR, DEFAULT_END_YEAR] = [2014, 2024]

2. Otherwise:
     startYear = max(MIN_YEAR, min over all event start/end years)
     endYear   = min(MAX_YEAR, max over all event start/end years)

3. Ensure at least 10 years of span:
     if (endYear - startYear < 9) {
       midYear   = floor((startYear + endYear) / 2)
       startYear = max(MIN_YEAR, midYear - 5)
       endYear   = min(MAX_YEAR, midYear + 5)
     }

4. Add 3-year scroll padding on both sides (clamped to [MIN_YEAR, MAX_YEAR]).

5. Generate one Month per (year, 0..11) in the range.
```

Constants: `MIN_YEAR = 1900`, `MAX_YEAR = 2100`, `DEFAULT_START_YEAR = 2014`, `DEFAULT_END_YEAR = 2024`.

---

## Data Flow & Persistence

### Composition

```
useTimelineState
  ├── useEvents             ─ events array, addEvent / addEvents / updateEvent / setEvents / clearEvents
  ├── useTimelineTitle      ─ title, description
  ├── useCategories         ─ category configs (defaults to DEFAULT_CATEGORIES)
  ├── useTimelineScale      ─ scale toggle ('large' | 'medium' | 'small') and the current TimelineScale object
  └── useGroupByCategory    ─ boolean toggle
```

Other timeline-page hooks live alongside but are not composed by `useTimelineState`:

```
useTimeline           ─ load / create / save the timeline record itself
useAutosave           ─ debounced persistence + status state
useLocalDraft         ─ localStorage drafts
useTimelineScroll     ─ scroll position + visible quarter range (consumed by Timeline.tsx)
useEventDrag          ─ drag interaction state machine (consumed by Timeline.tsx)
```

### Save flow

1. User makes a change (event edit, drag, rename, scale toggle, group toggle, etc.).
2. `useAutosave.handleChange(data)` sets `saveStatus = 'saving'`, marks `hasUnsavedChanges`, and starts a 2000 ms debounce.
3. After the debounce fires, `save(data)`:
   - `UPDATE` the `timelines` row (title, description, scale, group_by_category, updated_at).
   - `saveTimelineEvents(timelineId, events)` performs a diff-based sync: classifies each event as INSERT / UPDATE / DELETE relative to the server, then executes UPDATE → DELETE → INSERT.
4. On success: `saveStatus = 'saved'`, `lastSavedTime = now`, `hasUnsavedChanges = false`.
5. On failure: `saveStatus = 'error'`. A `window.online` listener retries `save(timelineData)` when the browser comes back online.
6. A `beforeunload` listener fires `e.preventDefault()` while `hasUnsavedChanges` is true, prompting the browser's "leave site?" dialog.

### Local draft

`useLocalDraft` exposes `loadAllDrafts`, `loadDraft`, `saveDraft` (debounced 500 ms), `saveDraftImmediate`, `createDraft`, `deleteDraft`, `clearAllDrafts`, `getDraftCount`. It delegates persistence to `src/utils/draftStorage.ts`; the payload type is `LocalDraft` exported from that module.

### Event operations

- **Create:** `useEvents.addEvent(omit)` generates `id` via `crypto.randomUUID()` and returns the new event.
- **Update:** `useEvents.updateEvent(event)` replaces by `id` in local state.
- **Batch add:** `useEvents.addEvents(omits) → { added, duplicates }` deduplicates against the existing list by `(title, startDate, endDate, category)`.
- **Delete:** the page filters the event out of local state; `saveTimelineEvents` detects the missing `id` and emits a DELETE.

### Plan limits

`src/lib/limits.ts` defines `LimitReachedError` (with `kind: 'event' | 'timeline'` and `limit: number`). `useTimeline.checkCreateTimelineLimits(userId)` runs before creating a new timeline (or saving the first version of one) and throws `LimitReachedError` if either the per-user event count or timeline count exceeds the current plan's limit (looked up via `getCurrentLimits()` in `lib/limits.ts`).

---

## Key Constants

**`src/constants/timeline.ts`**

| Constant | Value | Description |
|---|---|---|
| `SCROLL_INDICATOR_HEIGHT` | `36` | Height of the year indicator row above the grid |
| `HEADER_HEIGHT` | `64` | Year labels (32) + month labels (32) |
| `EVENT_HEIGHT` | `36` | Height of one event row (used in grouped mode) |
| `EVENT_ROW_HEIGHT` | `38` | `EVENT_HEIGHT` + 2px vertical gap (used in default mode) |
| `EVENT_MIN_WIDTH` | `120` | Minimum width for event title visibility |
| `CATEGORY_PADDING` | `8` | Vertical padding within a band |
| `CATEGORY_MIN_HEIGHT` | `80` | Minimum height of an empty band |

**`src/constants/scales.ts`**

| `value` | `monthWidth` | `quarterWidth` |
|---|---|---|
| `large` | `28` | `7` |
| `medium` | `20` | `5` |
| `small` | `12` | `3` |

**`src/constants/categories.ts`** — `DEFAULT_CATEGORIES`:

| `id` | `label` | `color` |
|---|---|---|
| `category_1` | `Category 1` | `#A770EC` (Purple) |
| `category_2` | `Category 2` | `#FF7D05` (Orange) |
| `category_3` | `Category 3` | `#259E23` (Green) |
| `category_4` | `Category 4` | `#4196E4` (Blue) |

**Other notable constants referenced above**

| Constant | Defined in | Value |
|---|---|---|
| `DRAG_THRESHOLD` | `src/hooks/useEventDrag.ts` | `5` (px) |
| `TITLE_CHROME_WIDTH` | `src/utils/eventStacking.ts` | `20` (px) |
| `TRAILING_BUFFER_PX` | `src/utils/eventStacking.ts` | `24` (px) |
| `TITLE_FONT` | `src/utils/eventStacking.ts` | `'400 16px Avenir, sans-serif'` |
| `MIN_YEAR` / `MAX_YEAR` | `src/utils/dateUtils.ts` | `1900` / `2100` |
| `DEFAULT_START_YEAR` / `DEFAULT_END_YEAR` | `src/utils/dateUtils.ts` | `2014` / `2024` |
| `STACK_TRANSITION_MS` | `src/components/Timeline/TimelineEvent.tsx` | `220` |
| Wheel lerp factor | `src/components/Timeline/Timeline.tsx` | `0.18` |
| Autosave debounce | `src/hooks/useAutosave.ts` | `2000` ms |
| Local draft debounce | `src/hooks/useLocalDraft.ts` | `500` ms |

---

## Hook Reference

Hooks consumed (directly or via composition) by the timeline page.

| Hook | File | Purpose |
|---|---|---|
| `useTimelineState` | `hooks/useTimelineState.ts` | Composes events, title, categories, scale, and groupByCategory into a single state hook |
| `useTimeline` | `hooks/useTimeline.ts` | Loads / creates / saves the timeline record from Supabase; enforces plan limits before creation |
| `useEvents` | `hooks/useEvents.ts` | Local event CRUD (add, update, batch-add with dedup, clear) |
| `useAutosave` | `hooks/useAutosave.ts` | Debounced persistence (2000 ms), beforeunload guard, online retry |
| `useTimelineScale` | `hooks/useTimelineScale.ts` | Scale toggle (`large` / `medium` / `small`) + current `TimelineScale` |
| `useTimelineTitle` | `hooks/useTimelineTitle.ts` | Title and description state |
| `useCategories` | `hooks/useCategories.ts` | Category config state with `DEFAULT_CATEGORIES` fallback |
| `useGroupByCategory` | `hooks/useGroupByCategory.ts` | `groupByCategory` boolean toggle |
| `useTimelineScroll` | `hooks/useTimelineScroll.ts` | Tracks `scrollLeft`, container/content widths, and `visibleRange` (in quarter-columns) |
| `useEventDrag` | `hooks/useEventDrag.ts` | Pointer-driven drag state machine; defines `DRAG_THRESHOLD = 5` |
| `useLocalDraft` | `hooks/useLocalDraft.ts` | localStorage draft CRUD with 500 ms debounced save |
| `useTimelines` | `hooks/useTimelines.ts` | List of the user's timelines with realtime subscription and retry-with-backoff |
| `useTimelineMetadata` | `hooks/useTimelineMetadata.ts` | Per-timeline event count, year range, and dominant category color (for timeline cards) |
| `useSidePanel` | `hooks/useSidePanel.ts` | Accesses `SidePanelContext` (open/close state for the event details side panel) |
| `useAuth` | `hooks/useAuth.ts` | Accesses `AuthContext` (current user) |
