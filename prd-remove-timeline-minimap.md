# PRD: Remove the Mini Timeline Map

## Summary

Remove the `TimelineOverview` mini-map feature — the small fixed-position overview strip that appears at the bottom-center of the timeline when the timeline spans 600 or more months (~50 years). The feature renders a proportionally-scaled summary of events and a viewport indicator, and is only used on very long timelines.

## Background & Motivation

The mini-map is only visible on timelines of ~50+ years, so most users never see it. It adds code, visual noise, and a second coordinate system (year-based, not month-based) that duplicates the main timeline's scroll behavior without meaningfully improving navigation. `TimelineScrollIndicator` already provides a lightweight year indicator for scroll context, which is retained.

## Goals

- Remove the `TimelineOverview` component and its documentation entirely.
- Remove the component's only integration point in `Timeline.tsx`.
- Leave `useTimelineScroll` and `TimelineScrollIndicator` untouched — they are shared infrastructure.
- Keep the build clean: no dead imports, no unused props, no stale doc references.

## Non-Goals

- No replacement minimap/overview UI.
- No changes to scroll behavior, zoom, or event rendering.
- No changes to `useTimelineScroll` — it is shared with `TimelineScrollIndicator`.
- No changes to `TimelineScrollIndicator` itself.

## Current Behavior

- File: `src/components/Timeline/TimelineOverview.tsx` (90 lines).
- Rendered in `src/components/Timeline/Timeline.tsx` at lines 305–313, only when `!isFullScreen`.
- Visibility threshold: `if (months.length < 600) return null;` (TimelineOverview.tsx:21).
- Renders: bottom-centered panel, 4px-per-year strip, event bars stacked in 3 rows, white viewport rectangle, and first/last year labels.
- Receives a `scale` prop from `Timeline.tsx` that it never declares or uses — already dead weight.

## Proposed Behavior

The mini-map no longer renders under any condition. Long timelines simply scroll horizontally with the existing `TimelineScrollIndicator` year label as navigation aid.

## Scope of Code Removal

### Files to delete

1. **`src/components/Timeline/TimelineOverview.tsx`** — the component itself (90 lines, exclusive to this feature).
2. **`src/components/Timeline/TimelineOverview.md`** — component-level architecture doc (exclusive to this feature).

### Files to modify

3. **`src/components/Timeline/Timeline.tsx`**
   - Remove the import at line 7: `import { TimelineOverview } from './TimelineOverview';`
   - Remove the render block at lines 305–313:
     ```tsx
     {!isFullScreen && (
       <TimelineOverview
         months={months}
         events={visibleEvents}
         visibleRange={visibleRange}
         categories={visibleCategories}
         scale={scale}
       />
     )}
     ```
   - Verify `visibleRange` (line 72) is still consumed elsewhere (it is — `TimelineScrollIndicator` uses it). Leave `useTimelineScroll` in place.

4. **`src/TIMELINE_ARCHITECTURE.md`**
   - Remove component-hierarchy references on lines 12, 18, 42.
   - Remove the full "Timeline Overview (Mini-Map)" section at lines 292–315.

### Files to leave alone (shared, not exclusive to minimap)

- `src/hooks/useTimelineScroll.ts` — also powers `TimelineScrollIndicator`.
- `src/components/Timeline/TimelineScrollIndicator.tsx` — independent feature that happens to consume the same `visibleRange`.
- `src/components/Timeline/Timeline.tsx` — other than the two edits above, nothing else changes. `visibleRange` is still needed for the scroll indicator.

## Risks & Considerations

- **Low risk**: the feature is self-contained. The only consumer of `TimelineOverview` is `Timeline.tsx`.
- **No data migration**: no persisted state, no Supabase changes, no env vars.
- **No API/type ripple**: `TimelineOverviewProps` is internal and deleted with the file. No external type consumers.
- **Watch for**: that `scale` in `Timeline.tsx` is still consumed elsewhere (it is — used for `monthWidth`). Do not remove it.
- **Watch for**: no other file imports `TimelineOverview` (verified — only `Timeline.tsx` imports it).

## Acceptance Criteria

- [ ] `TimelineOverview.tsx` and `TimelineOverview.md` no longer exist.
- [ ] `Timeline.tsx` has no reference to `TimelineOverview`.
- [ ] `TIMELINE_ARCHITECTURE.md` has no reference to the mini-map / `TimelineOverview`.
- [ ] `npm run lint` passes with no new warnings.
- [ ] `npm run build` succeeds.
- [ ] Manual check: loading a short timeline and a long timeline (>50 years) both render correctly; the bottom-center overview strip is gone in both cases; horizontal scroll and `TimelineScrollIndicator` still work.
- [ ] Repo-wide grep for `TimelineOverview`, `minimap`, `mini-map`, `MiniMap` returns only unrelated matches (if any).

## Rollout

Single PR on branch `claude/remove-timeline-map-HEciR`. No feature flag, no staged rollout — the feature is only visible on very long timelines and has no persistence or downstream dependencies.

## Out of Scope / Future Work

If navigation on very long timelines becomes a problem, consider a keyboard-driven year jump or a compact year-picker in the header rather than reintroducing a floating minimap.
