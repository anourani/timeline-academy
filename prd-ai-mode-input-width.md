# PRD: AI Mode Text Input Width Update

## Summary

Update the AI-mode text input (the search field on the "Generate a timeline of any subject" screen) to be exactly **360px** wide.

## Background

The AI Mode landing screen (`/` route, rendered by `AIModePage` → `NewTimelineScreen`) contains the primary text input users interact with to generate an AI timeline. The input wrapper is currently sized at `340px`, and its parent form container is sized at `364px`. Design has requested the input field render at `360px` wide.

## Goals

- The AI-mode text input renders at **360px** wide on viewports wide enough to contain it.
- The change is visually consistent with the surrounding layout (parent container, suggestion dropdown, submit button positioning).
- Mobile/narrow-viewport behavior is preserved via the existing `max-w-full` constraint.

## Non-Goals

- No changes to input styling (font, border, shadow, height, padding).
- No changes to placeholder rotation, suggestion dropdown behavior, or submit flow.
- No changes to the search input on any other screen.

## Scope

**File:** `src/components/NewTimeline/NewTimelineScreen.tsx`

**Current state (lines 167, 173):**
- Outer form container: `w-[364px]`
- Input wrapper div: `w-[340px]`
- Input element: `w-full min-w-[280px]`

**Proposed change:**
- Update the input wrapper div from `w-[340px]` → `w-[360px]` (line 173).
- Update the outer form container from `w-[364px]` → `w-[360px]` (line 167) so the input and its parent align, and so the heading + button remain centered over the input.
- Leave the input element's `w-full min-w-[280px]` untouched — it will inherit `360px` from its parent.

## Acceptance Criteria

1. The AI-mode text input measures **360px** wide in devtools on a desktop viewport.
2. The input, the "Generate a timeline of any subject" heading, and the Generate/Cancel button remain horizontally centered and aligned with each other.
3. The suggestion dropdown (rendered in an absolutely positioned wrapper spanning `left-0 right-0` within the input's parent) still aligns with the input.
4. On narrow viewports (< 360px), the input continues to shrink via `max-w-full` and does not overflow the screen.
5. No regressions to the classifying/generating/cancel states or to the rotating placeholder.
6. `npm run lint` and `npm run build` both pass.

## Test Plan

- Visual check on desktop (≥ 1024px): input is 360px, centered, with dropdown aligned.
- Visual check on mobile (375px and 320px widths): input shrinks to container, no horizontal scroll.
- Interaction check: focus shows suggestions dropdown aligned with input; submit triggers generation; cancel works during generation.
- Dark mode check: border, shadow, and background render as before.

## Rollout

- Single-file CSS class change; ship via normal PR review.
- No feature flag, no migration, no analytics changes.

## Open Questions

- Should the outer form container also become `360px` to match the input exactly, or stay slightly wider (`364px`) to preserve a small visual inset? Current recommendation: match at `360px` for clean alignment. Confirm with design before implementation.
