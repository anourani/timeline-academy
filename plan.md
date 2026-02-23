# Plan: Create Timelines Homepage

## Overview
Create a dedicated Timelines homepage that serves as a landing page when users click the "Timelines" breadcrumb in the `GlobalNav`. Currently "Timelines" is static text — this plan turns it into a navigable link to a new `/timelines` route.

## Current State
- **Routes**: `/` (editor), `/view/:timelineId` (viewer)
- **Breadcrumb**: `GlobalNav.tsx` renders `<span>Timelines</span>` as non-clickable text
- **Timeline list**: Currently lives inside `SidePanel.tsx` as a slide-out drawer
- **Data**: `useTimelines` hook fetches user's timelines from Supabase, `TimelineList` renders them

## Implementation Steps

### 1. Create the `TimelinesPage` component
**File**: `src/components/TimelinesPage/TimelinesPage.tsx`

Build a full-page component that displays the user's timelines. This is the page users see when they click "Timelines" in the breadcrumb.

**Content for logged-in users:**
- Page heading: "Timelines"
- Grid/list of the user's timelines (reuse data from `useTimelines` hook)
- Each timeline card shows: title, last updated date
- Clicking a card navigates to `/` and loads that timeline
- "Create new timeline" button (respecting the 3-timeline max)

**Content for logged-out users:**
- Page heading: "Timelines"
- Prompt to sign in / sign up to access timelines
- Auth modal triggers for sign-in/sign-up

### 2. Add the `/timelines` route
**File**: `src/Router.tsx`

Add a new route entry:
```tsx
{
  path: '/timelines',
  element: <TimelinesPage />
}
```

This keeps `/` as the existing editor and adds `/timelines` as the new homepage.

### 3. Make the "Timelines" breadcrumb a clickable link
**File**: `src/components/Header/GlobalNav.tsx`

Replace the static `<span>Timelines</span>` with a `<Link to="/timelines">` from React Router. This applies to both the logged-in breadcrumb path ("Timelines / Title") and the logged-out label. The link should have hover styling consistent with the existing nav design (`text-gray-400 hover:text-white`).

### 4. Wrap the editor (`App`) route in the router context
**File**: `src/Router.tsx`

The `App` component currently sits at `/`. To support navigation from `/timelines` to a specific timeline at `/`, pass timeline selection state via URL search params or route state. The simplest approach: when a user clicks a timeline on the homepage, navigate to `/?timeline={id}` and have `App` pick up the `timeline` param to auto-load it.

Alternatively, keep the existing `App` behavior (which auto-loads the user's timeline on mount via `useTimeline`) and simply use `navigate('/')` — the app will load the most recently updated timeline by default.

### 5. Handle timeline selection from the homepage
**File**: `src/App.tsx` (minor adjustment)

When navigating from the Timelines homepage to a specific timeline, use React Router's `useSearchParams` or `useLocation` state to receive the selected timeline ID. Call `loadTimeline(id)` to switch to it. This mirrors the existing `handleTimelineSwitch` logic.

## Files Changed
| File | Change |
|------|--------|
| `src/components/TimelinesPage/TimelinesPage.tsx` | **New** — Homepage component |
| `src/Router.tsx` | Add `/timelines` route |
| `src/components/Header/GlobalNav.tsx` | Make "Timelines" a `<Link>` |
| `src/App.tsx` | Read timeline ID from URL params to support deep-linking from homepage |

## Design Decisions
- **Reuse `useTimelines` hook** — no new data-fetching logic needed
- **Keep SidePanel** — the side panel remains for quick access from the editor; the homepage is a separate, full-page experience
- **Dark theme** — matches existing app: black background, gray-800 cards, white text, blue-600 accent buttons
- **Minimal scope** — no new database tables, API calls, or auth changes needed
