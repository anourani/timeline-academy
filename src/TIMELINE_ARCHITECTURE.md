# Timeline Architecture

> Living documentation of how the timeline page works. Update this file whenever timeline logic changes.

## Table of Contents

1. [Component Hierarchy](#component-hierarchy)
2. [Layout System](#layout-system)
3. [Grid System](#grid-system)
4. [Category Labels (Left Sidebar)](#category-labels-left-sidebar)
5. [Header (Year & Month Labels)](#header-year--month-labels)
6. [Scroll Indicator (Floating Year)](#scroll-indicator-floating-year)
7. [Event Rendering](#event-rendering)
8. [Event Stacking Algorithm](#event-stacking-algorithm)
9. [Category Height Calculation](#category-height-calculation)
10. [Drag-and-Drop System](#drag-and-drop-system)
11. [Scale / Zoom System](#scale--zoom-system)
12. [Timeline Overview (Mini-Map)](#timeline-overview-mini-map)
13. [Date-to-Grid Math](#date-to-grid-math)
14. [Timeline Range Calculation](#timeline-range-calculation)
15. [Data Flow & Persistence](#data-flow--persistence)
16. [Key Constants](#key-constants)
17. [Key Types](#key-types)
18. [Hook Reference](#hook-reference)

---

## Component Hierarchy

```
Timeline.tsx                    ← Main orchestrator
├── TimelineCategoryLabels      ← Absolutely positioned left sidebar (150px)
├── Scroll Container            ← Horizontal overflow, houses everything below
│   ├── TimelineHeader          ← Sticky header row
│   │   ├── TimelineYearLabels  ← Year spans across months
│   │   └── TimelineMonthLabels ← Individual month columns
│   ├── Category Sections       ← One section per visible category
│   │   ├── TimelineGrid        ← Transparent interaction overlay (month hover/click)
│   │   └── TimelineEvent[]     ← Events positioned in CSS Grid
│   └── Month Hover Overlay     ← Semi-transparent highlight on hovered month
├── TimelineScrollIndicator     ← Floating year label at left edge
└── TimelineOverview            ← Mini-map (only for timelines ≥ 600 months / ~50 years)
```

---

## Layout System

The timeline uses a **two-column layout**:

```
┌─────────────┬──────────────────────────────────────────────────┐
│  Category   │  Scrollable Timeline Content                     │
│  Labels     │  ┌────────────────────────────────────────────┐  │
│  (150px)    │  │ Year Labels    │ 2020 │ 2021 │ 2022 │ ... │  │
│  absolute   │  ├────────────────────────────────────────────┤  │
│  z-10       │  │ Month Labels   │ Jan│Feb│Mar│Apr│... │     │  │
│             │  ├────────────────────────────────────────────┤  │
│  ┌────────┐ │  │ Category 1   [===Event===]  [==Event==]   │  │
│  │Cat 1   │ │  │              [====Event====]              │  │
│  ├────────┤ │  ├────────────────────────────────────────────┤  │
│  │Cat 2   │ │  │ Category 2        [===Event===]           │  │
│  ├────────┤ │  ├────────────────────────────────────────────┤  │
│  │Cat 3   │ │  │ Category 3   [==Event==]                  │  │
│  └────────┘ │  └────────────────────────────────────────────┘  │
└─────────────┴──────────────────────────────────────────────────┘
```

- **Left sidebar**: `absolute left-0 top-[64px] w-[150px] z-10 bg-black`
- **Scroll container**: `overflow-x-auto scrollbar-hide` with `margin-left: -150px` and `padding-left: 150px` to keep the sidebar fixed while content scrolls

The root div uses `h-[calc(100vh-6rem)]` in fullscreen mode or `relative mb-16` in normal mode.

---

## Grid System

The timeline content is a **CSS Grid** where each column represents one quarter of a month.

```
Grid columns = months.length × 4
Column width  = scale.quarterWidth (8px large / 6.5px small)
```

```css
grid-template-columns: repeat(${months.length * 4}, ${scale.quarterWidth}px);
```

**Example:** A 10-year timeline (120 months) at large scale = 120 × 4 = 480 columns, each 8px wide = 3,840px total width.

Each category section gets its own grid with the same column template. Events are placed via `gridColumn` start/end spans.

---

## Category Labels (Left Sidebar)

**Component:** `TimelineCategoryLabels.tsx`

Rendered as a vertical stack of colored boxes, one per visible category. Each label:

- **Background:** `${category.color}47` (hex color with 47 alpha suffix for transparency)
- **Border:** `border-2 border-black` with rounded corners
- **Right accent:** `absolute top-0 right-0 w-1 h-full` in solid category color
- **Text:** `text-sm font-medium uppercase break-words` in `#fbfbfb`
- **Height:** Matches corresponding category section height (dynamic, based on event stacking)

Parent container: `relative h-full ml-3`

---

## Header (Year & Month Labels)

**Component:** `TimelineHeader.tsx` → wraps `TimelineYearLabels` + `TimelineMonthLabels`

The header uses a CSS Grid with one column per month:

```css
grid-template-columns: repeat(${months.length}, ${scale.monthWidth}px);
```

### Year Labels (`TimelineYearLabels.tsx`)
- Spans full grid width: `gridColumn: 1 / span ${months.length}`
- Flexbox row where each year section width = `monthsInYear × scale.monthWidth`
- Height: 32px (`h-8`)
- Year text: `text-sm text-gray-400 text-center font-mono`
- Animated width transitions: `transition-[width] duration-200 ease-in-out`

### Month Labels (`TimelineMonthLabels.tsx`)
- Grid: one cell per month, each `${scale.monthWidth}px` wide
- Height: 32px (`h-8`)
- Month text: `text-[10px] text-gray-500 font-mono`, formatted via `date-fns` → `'MMM'` (Jan, Feb, etc.)
- Vertical borders: `border-r border-gray-700` between months

---

## Scroll Indicator (Floating Year)

**Component:** `TimelineScrollIndicator.tsx`

A fixed indicator at the left edge of the timeline that shows which year the user is currently viewing.

- **Position:** `absolute left-[150px] top-[32px] bottom-[32px]`
- **Visual:** 4px wide white vertical bar with upper extension line (24px)
- **Year display:** `text-2xl` monospace text, 8px above the indicator bar

**Logic:** Uses `getCurrentTimelinePosition()` from `timelineUtils.ts` which:
1. Reads `scrollLeft` from the scroll container
2. Calculates which month index corresponds to that scroll position
3. Returns current month, next month, and whether December is ending
4. The indicator displays the corresponding year

---

## Event Rendering

**Component:** `TimelineEvent.tsx` (React.memo wrapped)

Each event renders as a horizontal bar within its category's CSS Grid:

### Grid Positioning
```
gridColumn: ${startColumn} / ${endColumn}
gridRow:    ${event.stackIndex + 1}
```

Start/end columns are calculated from dates:
- Find the month index in the timeline's months array
- Calculate the quarter within that month: `Math.floor((day - 1) / 8)`
- Column number: `(monthIndex × 4) + quarterIndex + 1` (1-indexed for CSS Grid)

### Visual Styling
- **Multi-day events:** Background `${categoryColor}73` (color with 73 alpha), left accent bar (8px solid category color), rounded
- **Single-day events:** Transparent background, only the accent bar is visible
- **Text:** White, truncated with `overflow-hidden text-ellipsis whitespace-nowrap`
- **Hover:** `hover:brightness-110` with transition
- **Cursor:** `grab` (idle) / `grabbing` (while dragging)

### During Drag
- **Transform:** `translateX(${dragDeltaPixels}px) scale(1.04)`
- **Z-index:** 1000 (elevated above all other events)
- **Box shadow:** `0 8px 24px rgba(0, 0, 0, 0.45)`
- **Opacity:** 0.92
- **Ghost placeholder:** Remains at original position with opacity 0.3 and `pointer-events: none`

---

## Event Stacking Algorithm

**File:** `src/utils/eventStacking.ts`

Determines vertical positioning of events within a category to avoid overlaps.

### Algorithm

```
Input:  events[] (for one category), months[]
Output: StackedEvent[] (each event gets a stackIndex)

1. Sort events by start date ASC, then by duration ASC (shorter events first)

2. For each event:
   a. Calculate startColumn from start date → month index × 4 + quarter
   b. Calculate endColumn from end date → month index × 4 + quarter
   c. Calculate title width in columns:
      titleColumns = ceil(max(EVENT_MIN_WIDTH, title.length × 8) / monthWidth)
   d. Visual end = max(endColumn, startColumn + titleColumns - 1)

   e. Find first available stackIndex (starting from 0):
      - Check collision with all already-placed events at that stackIndex
      - Collision = (newStart ≤ existingVisualEnd) AND (existingStart ≤ newVisualEnd)
      - Assign first collision-free stackIndex

3. Return events with stackIndex added
```

### Key Details
- `EVENT_MIN_WIDTH` = 120px ensures short events still have enough room for title text
- Title width approximation: 8px per character
- The "visual end" concept prevents title text from overlapping even if the date range is narrow

---

## Category Height Calculation

**Hook:** `useCategoryHeights.ts`

Determines the pixel height of each category section based on how many events stack vertically.

```
For each category:
  maxStack = highest stackIndex among events in that category + 1
  height   = max(CATEGORY_MIN_HEIGHT, maxStack × EVENT_ROW_HEIGHT + CATEGORY_PADDING)
```

Where:
- `CATEGORY_MIN_HEIGHT` = 80px (minimum even for empty categories)
- `EVENT_ROW_HEIGHT` = 38px (EVENT_HEIGHT 36px + 2px gap)
- `CATEGORY_PADDING` = 8px

The hook also uses `doEventsOverlap()` and `getMaxOverlappingEvents()` for an alternative overlap-counting approach (counting maximum concurrent events using date-range overlap detection).

---

## Drag-and-Drop System

**Hook:** `useEventDrag.ts`

Allows users to drag events horizontally to change their dates.

### Flow

1. **Pointer Down** (`handlePointerDown`):
   - Records start X position and current scroll offset
   - Sets `draggedEventId`

2. **Pointer Move** (`handlePointerMove`):
   - Calculates total pixel delta (including scroll changes since drag start)
   - Applies `DRAG_THRESHOLD` (5px) — movement below this is treated as a click, not a drag
   - Converts pixels to quarters: `deltaQuarters = Math.round(deltaPixels / scale.quarterWidth)`
   - Updates `dragState: { isDragging, draggedEventId, deltaQuarters, deltaPixels }`

3. **Pointer Up** → `handleDragEnd` in `Timeline.tsx`:
   - Calls `shiftEventDates(event, deltaQuarters)` from `dateUtils.ts`
   - Each quarter = 7 days: shifts both start and end dates by `deltaQuarters × 7` days
   - Updates event via `onUpdateEvent` callback

4. **Anti-click guard:** `justDraggedRef` prevents click handlers from firing immediately after a drag ends

### Edge-of-viewport scrolling
Timeline.tsx uses `requestAnimationFrame` to auto-scroll the container when dragging near edges.

---

## Scale / Zoom System

**Hook:** `useTimelineScale.ts`
**Constants:** `src/constants/scales.ts`

Two scale options:

| Scale   | monthWidth | quarterWidth | Use case        |
|---------|-----------|-------------|-----------------|
| `large` | 32px      | 8px         | Default, detail |
| `small` | 26px      | 6.5px       | Overview, dense |

- Scale selection persists to the `timelines.scale` column in Supabase
- Changing scale recalculates all event positions (same grid math, different pixel widths)
- `useAutosave` saves scale changes automatically

---

## Timeline Overview (Mini-Map)

**Component:** `TimelineOverview.tsx`

A fixed-position mini-map at the bottom center of the viewport, shown only for long timelines (≥ 600 months / ~50 years).

- **Position:** `fixed bottom-4 left-1/2 -translate-x-1/2`
- **Style:** `backdrop-blur-sm bg-gray-900/90`, rounded, with padding
- **Width:** `totalYears × 4px`
- **Height:** 24px

### Elements
- **Event dots:** Absolute-positioned colored bars per event
  - Width: `max(((endYear - startYear) × pixelsPerYear) || 2, 2)` (minimum 2px)
  - Left: `(startYear - firstYear) × pixelsPerYear`
  - Vertical stacking: `top: ${(index % 3) × 6 + 6}px` (3 rows, 6px apart)
  - Color: category color at 0.7 opacity

- **Visible range indicator:** `absolute h-full bg-white/20 border border-white/40 rounded`
  - Width and position calculated from `visibleRange` prop (start/end month indices)

- **Year labels:** Start and end year markers with border separators

---

## Date-to-Grid Math

How dates map to CSS Grid columns:

```
Month Index   = findIndex in months[] where month.year === date.year && month.month === date.month
Quarter Index = Math.floor((day - 1) / 8)
  Day  1–8  → Quarter 0
  Day  9–16 → Quarter 1
  Day 17–24 → Quarter 2
  Day 25–31 → Quarter 3

Grid Column = (monthIndex × 4) + quarterIndex + 1    (1-indexed for CSS Grid)
```

**Pixel position of a column:**
```
pixelX = (gridColumn - 1) × scale.quarterWidth
```

**Reverse (drag delta to date shift):**
```
deltaQuarters = Math.round(deltaPixels / scale.quarterWidth)
dateDelta     = deltaQuarters × 7 days
```

Each quarter represents approximately 7–8 days. The mapping is approximate but provides consistent visual spacing.

---

## Timeline Range Calculation

**File:** `src/utils/timelineRange.ts`

Determines which months to render based on event dates.

### Rules
1. **Empty timeline:** DEFAULT_START_YEAR (2014) to DEFAULT_END_YEAR (2024)
2. **With events:** Min year and max year extracted from all event start/end dates
3. **Minimum span:** Always at least 10 years (adds padding on both ends if needed)
4. **Bounds:** MIN_YEAR = 1900, MAX_YEAR = 2100

### Month Generation
`generateMonthsRange(startYear, endYear)` creates a `Month[]` array with one entry per month:
```ts
{ year: number, month: number }  // month is 0-indexed (0 = January)
```

This array is the backbone of the entire grid — its length determines column count and event positioning.

---

## Data Flow & Persistence

### Hooks Architecture

```
useTimeline         ← Loads/saves timeline record + events from/to Supabase
  ├── useEvents     ← Local event state (add, update, delete, batch)
  ├── useCategories ← Category labels/colors/visibility
  ├── useTimelineTitle ← Title + description state
  └── useTimelineScale ← Scale toggle (large/small)

useAutosave         ← Watches for changes, debounced save (2000ms)
useTimelineChanges  ← Tracks dirty state vs last saved baseline
useLocalDraft       ← localStorage backup for unsaved work
useTimelineScroll   ← Scroll position tracking for indicator + mini-map
useEventDrag        ← Drag interaction state machine
useCategoryHeights  ← Computes category section heights from stacking
```

### Save Flow

1. User makes a change (edit event, drag, rename, etc.)
2. `useTimelineChanges` detects diff from baseline (JSON comparison)
3. `useAutosave.handleChange()` is called, starts 2000ms debounce timer
4. Save status → `'saving'`
5. `saveTimelineEvents()` performs **diff-based sync**:
   - Fetches current server events
   - Classifies each as INSERT, UPDATE, or DELETE
   - Executes in order: UPDATE → DELETE → INSERT
6. Save status → `'saved'` (or `'error'` on failure)
7. Network recovery: if save failed, retries automatically on `window.online` event
8. Beforeunload warning: prompts user if unsaved changes exist when closing tab

### Event Operations
- **Create:** `useEvents.addEvent()` generates UUID via `crypto.randomUUID()`
- **Update:** `useEvents.updateEvent()` replaces by id in local state
- **Batch add:** `useEvents.addEvents()` deduplicates by (title + dates + category)
- **Delete:** Filter event out of local state; `saveTimelineEvents()` detects the removal
- **Limit:** Maximum 3 timelines per user (enforced in `useTimeline`)

### Local Draft
`useLocalDraft` saves to localStorage with 500ms debounce as a safety net:
```ts
{ title, description, events, categories, scale, savedAt }
```

---

## Key Constants

**File:** `src/constants/timeline.ts`

| Constant             | Value  | Description                              |
|---------------------|--------|------------------------------------------|
| `EVENT_HEIGHT`       | 36px   | Height of an event bar                   |
| `EVENT_ROW_HEIGHT`   | 38px   | Event height + 2px vertical gap          |
| `EVENT_MIN_WIDTH`    | 120px  | Minimum event width for title visibility |
| `CATEGORY_PADDING`   | 8px    | Vertical padding within category section |
| `CATEGORY_MIN_HEIGHT`| 80px   | Minimum height for empty categories      |

**File:** `src/constants/scales.ts`

| Scale   | monthWidth | quarterWidth |
|---------|-----------|-------------|
| `large` | 32px      | 8px         |
| `small` | 26px      | 6.5px       |

**File:** `src/constants/categories.ts`

| Category     | Label      | Color     |
|-------------|------------|-----------|
| `category_1` | Category 1 | `#A770EC` (Purple) |
| `category_2` | Category 2 | `#FF7D05` (Orange) |
| `category_3` | Category 3 | `#259E23` (Green)  |
| `category_4` | Category 4 | `#4196E4` (Blue)   |

---

## Key Types

**File:** `src/types/event.ts`

```ts
interface TimelineEvent {
  id: string
  title: string
  startDate: string   // ISO YYYY-MM-DD
  endDate: string     // ISO YYYY-MM-DD
  category: TimelineCategory
}

type TimelineCategory = 'category_1' | 'category_2' | 'category_3' | 'category_4'

interface CategoryConfig {
  id: TimelineCategory
  label: string
  color: string       // Hex color
  visible: boolean
}
```

**File:** `src/types/timeline.ts`

```ts
interface Month {
  year: number
  month: number       // 0-indexed (0 = January)
}

interface Timeline {
  id: string
  title: string
  updated_at: string
  user_id: string
  scale: 'large' | 'small'
}

interface TimelineScale {
  value: 'large' | 'small'
  monthWidth: number    // 32 or 26
  quarterWidth: number  // 8 or 6.5
}
```

**File:** `src/utils/eventStacking.ts`

```ts
interface StackedEvent extends TimelineEvent {
  stackIndex: number   // Vertical row index within category (0-based)
}
```

---

## Hook Reference

| Hook | File | Purpose |
|------|------|---------|
| `useTimeline` | `hooks/useTimeline.ts` | Load/save timeline records and events from Supabase |
| `useEvents` | `hooks/useEvents.ts` | Local event CRUD state management |
| `useAutosave` | `hooks/useAutosave.ts` | Debounced persistence with status tracking |
| `useTimelineScale` | `hooks/useTimelineScale.ts` | Scale toggle (large/small) |
| `useCategories` | `hooks/useCategories.ts` | Category config state |
| `useCategoryHeights` | `hooks/useCategoryHeights.ts` | Dynamic category section heights |
| `useTimelineTitle` | `hooks/useTimelineTitle.ts` | Title and description state |
| `useEventDrag` | `hooks/useEventDrag.ts` | Drag-and-drop interaction handling |
| `useTimelineScroll` | `hooks/useTimelineScroll.ts` | Scroll position and visible range tracking |
| `useTimelineChanges` | `hooks/useTimelineChanges.ts` | Dirty state detection (JSON diff) |
| `useLocalDraft` | `hooks/useLocalDraft.ts` | localStorage draft backup |
| `useAIMode` | `hooks/useAIMode.ts` | AI-powered timeline generation |
| `useTimelines` | `hooks/useTimelines.ts` | Timeline list with real-time subscription |
| `useTimelineMetadata` | `hooks/useTimelineMetadata.ts` | Event count and year range for timeline cards |
| `useSidePanel` | `hooks/useSidePanel.ts` | Side panel open/close state |

---

## Interaction Overlay

**Component:** `TimelineGrid.tsx`

An invisible overlay grid that sits on top of each category section to capture mouse events.

- **Grid:** Same column template as the content grid (one column per month at `scale.monthWidth`)
- **Style:** `pointer-events-none` on parent, `pointerEvents: 'auto'` on individual month divs
- **Events:**
  - `onMouseEnter` → sets hovered month index (triggers highlight overlay)
  - `onMouseLeave` → clears hover
  - `onClick` → opens event creation modal for that month

**Month hover overlay** (rendered in `Timeline.tsx`):
- `bg-[#FBFBFB]/25` semi-transparent highlight
- Positioned at hovered month's grid column
- Full height of the category section
