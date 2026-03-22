# TimelineOverview

A minimap component that provides a bird's-eye view of the entire timeline. Fixed to the bottom-center of the screen.

## Visibility

Only renders when the timeline contains **600+ months** (~50 years). Below that threshold, the component returns `null`.

```ts
if (months.length < 600) return null;
```

## Layout

- **Position**: `fixed bottom-4`, centered horizontally with `left-1/2 -translate-x-1/2`
- **Width**: Calculated as `totalYears * 4px` (4 pixels per year). A 100-year timeline = 400px wide minimap.
- **Height**: 24px content area + padding

## Visual Elements

### 1. Event Dots
Each event is rendered as a small colored bar (`h-1`, 4px tall) positioned proportionally within the minimap:
- **Horizontal position**: Based on the event's start year relative to the timeline's first year
- **Width**: Proportional to the event's duration in years (minimum 2px)
- **Color**: Matches the event's category color at 70% opacity
- **Vertical stacking**: Events cycle through 3 vertical positions (`index % 3`) to avoid overlap

### 2. Viewport Indicator
A semi-transparent white rectangle (`bg-white/20`, `border-white/40`) showing which portion of the timeline is currently visible in the main scroll area:
- **Left**: `(visibleRange.start / totalMonths) * minimapWidth`
- **Width**: `((visibleRange.end - visibleRange.start) / totalMonths) * minimapWidth`

### 3. Year Boundary Labels
First and last year labels positioned at the left and right edges of the minimap, displayed above the bar (`-top-5`).

## Data Flow

```
useTimelineScroll (hook)
  → visibleRange { start, end }  (quarter-based indices)
    → TimelineOverview
      → Calculates viewport rectangle position
      → Maps events to minimap coordinates
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `months` | `Month[]` | Full array of months in the timeline |
| `events` | `TimelineEvent[]` | All timeline events |
| `categories` | `CategoryConfig[]` | Category configs (for colors) |
| `visibleRange` | `{ start, end }` | Currently visible quarter indices from scroll hook |
