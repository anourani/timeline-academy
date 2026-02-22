# GlobalNav Component — Research Reference

> **Source file:** `src/components/Header/GlobalNav.tsx`
> **Rendered by:** `src/App.tsx` (line 208)
> **Last reviewed:** 2026-02-22

This document is a reference for the GlobalNav component only — the persistent top navigation bar of the application. Consult this before making changes to GlobalNav.

---

## Purpose

GlobalNav is the topmost bar in the app. It provides:
- Navigation (hamburger menu to open the SidePanel)
- Inline timeline title editing
- Branding (centered logo)
- Quick actions (tutorial, feedback, present mode, share)

It renders identically for logged-in and logged-out users with one exception: the Share button is disabled when there is no saved timeline.

---

## Layout

The bar uses a three-section layout: `flex justify-between items-center relative` inside a `bg-black` container with `px-8 py-2`.

```
┌──────────────────────────────────────────────────────────────────────┐
│  [≡]  Timeline Title Input    |  timeline ACADEMY  |  Tutorial  Feedback  Present  [Share] │
│  ← Left section →             |  ← Center (abs) →  |  ← Right section →                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Left Section
`flex items-center gap-3`

| Element | Details |
|---------|---------|
| **Menu button** | Lucide `Menu` icon (20px). Gray text, hover → white. Rounded-lg with hover bg-gray-800. Calls `onViewTimelinesClick` which opens the SidePanel. `aria-label="View Timelines"` |
| **Title input** | `<input type="text">` bound to `title` prop. Transparent bg, white text, `text-sm font-medium`. Border is invisible by default, shows `border-gray-700` on hover, `border-gray-600 + ring-1 ring-gray-600` on focus. `max-w-[240px]`. Pressing Enter blurs the input. Fires `onTitleChange` on every keystroke. |

### Center Section
`absolute left-1/2 -translate-x-1/2` (truly centered regardless of left/right content width)

| Element | Details |
|---------|---------|
| **Logo SVG** | Inline SVG, 172x26 viewBox. Renders "timeline" in light gray (#F3F3F3) text and "ACADEMY" in white on a blue rounded rectangle (#2563EB at 0.4 opacity). `pointer-events-none` — not clickable or interactive. |

### Right Section
`flex items-center gap-4`

| Element | Type | Color | Behavior |
|---------|------|-------|----------|
| **"Quick Tutorial"** | Text button | Purple `#A770EC`, hover `#B68FF0` | Opens `isVideoTutorialOpen` modal. `text-sm font-medium`. |
| **"Feedback"** | Text button | Gray `text-gray-400`, hover white | Opens `isHelpOpen` feedback drawer. `text-sm`. |
| **"Present Mode"** | Text button | Gray `text-gray-400`, hover white | Calls `onPresentMode`. `text-sm`. |
| **"Share"** | Pill button | `bg-blue-600` white text, hover `bg-blue-700` | Copies `{origin}/view/{timelineId}` to clipboard via `navigator.clipboard.writeText()`. Shows browser `alert()` on success. **Disabled when `timelineId` is null** (50% opacity, not-allowed cursor). `px-4 py-1.5 rounded-md text-sm`. |

---

## Props

```typescript
interface GlobalNavProps {
  onViewTimelinesClick: () => void;    // Opens the SidePanel (hamburger menu click)
  onSignInClick: () => void;           // ⚠️ UNUSED — accepted but never called in JSX
  onSignUpClick: () => void;           // ⚠️ UNUSED — accepted but never called in JSX
  onPresentMode: () => void;           // Opens present mode (new tab)
  timelineId: string | null;           // Controls Share button disabled state
  title: string;                       // Current timeline title for inline input
  onTitleChange: (title: string) => void; // Called on title input change
}
```

### How App.tsx passes these props (lines 208-222)

```tsx
<GlobalNav
  onViewTimelinesClick={() => setShowSidePanel(true)}
  onSignInClick={() => { setIsSignUp(false); setShowAuthModal(true); }}
  onSignUpClick={() => { setIsSignUp(true); setShowAuthModal(true); }}
  onPresentMode={handlePresentMode}
  timelineId={timelineId}
  title={title}
  onTitleChange={setTitle}
/>
```

- `onViewTimelinesClick` toggles `showSidePanel` state in App.tsx
- `onSignInClick` / `onSignUpClick` are wired to open AuthModal but GlobalNav never calls them
- `onPresentMode` → `handlePresentMode()` which opens `/view/{timelineId}` in a new tab (or `/view/local` for unsaved timelines)
- `title` and `onTitleChange` share state with the TimelineTitle component below — editing in either place updates the same value

---

## Internal State

| State | Type | Default | Purpose |
|-------|------|---------|---------|
| `isHelpOpen` | `boolean` | `false` | Controls the Feedback slide-out drawer visibility |
| `isVideoTutorialOpen` | `boolean` | `false` | Controls the Quick Tutorial modal visibility |

---

## Auth Behavior (Logged-In vs Logged-Out)

GlobalNav imports `useAuth()` and destructures `user`, but **does not use `user` anywhere in its JSX or logic**. There is no conditional rendering based on authentication state.

| Aspect | Logged-In | Logged-Out |
|--------|-----------|------------|
| Menu button | Visible | Visible |
| Title input | Visible, editable | Visible, editable |
| Logo | Visible | Visible |
| Quick Tutorial | Visible | Visible |
| Feedback | Visible | Visible |
| Present Mode | Visible, functional | Visible, functional (uses `/view/local`) |
| Share button | **Enabled** (`timelineId` is set) | **Disabled** (`timelineId` is null) |

The Share button is the only element with different behavior, and it's driven by `timelineId` being null, not by `user` directly.

---

## Sub-Elements

### Feedback Drawer (right slide-out)

Triggered by the "Feedback" button. Implemented inline (not a separate component).

**Structure:**
- **Backdrop overlay**: `fixed inset-0 bg-black/50 z-40`, fades in/out with opacity transition (250ms ease-in-out). Clicking it closes the drawer.
- **Drawer panel**: `fixed right-0 top-0 h-full w-[400px] min-w-[360px] bg-gray-800 z-50`. Slides in/out via `translate-x` transition (250ms ease-in-out).
- **Header**: "Feedback" title (text-xl font-semibold white) + X close button (Lucide `X`, 20px, gray-400, hover white, rounded-full hover bg-gray-700).
- **Body** (p-6, text-gray-300, space-y-4):
  - "Hi, I'm Alex." (white, font-medium)
  - Three paragraphs about timeline.academy and requesting feedback
  - "Thanks!"
- **Action buttons** (pt-4, space-y-3):
  - "Give Feedback" — `bg-blue-600` button, opens `mailto:alex@timeline.academy` with pre-filled subject
  - "Buy me a coffee" — `bg-gray-700` link to `https://buymeacoffee.com/ttjs81madp`, opens in new tab

### Quick Tutorial Modal

Triggered by the "Quick Tutorial" button. Uses the shared `Modal` component (`src/components/Modal/Modal.tsx`).

**Structure:**
- Title: "Quick Tutorial to Get Started"
- Description paragraph about the tutorial content (text-gray-300)
- Loom video link in an `aspect-video` container:
  - Links to `https://www.loom.com/share/f19575818a9341d4a266c482af981ba2`
  - Opens in new tab (`target="_blank"`)
  - Shows Lucide `Video` icon (48px) with text "Click to watch the tutorial video on Loom"
  - Styled as `bg-gray-700 rounded-lg` with hover `bg-gray-600`

---

## Internal Methods

| Method | Lines | Behavior |
|--------|-------|----------|
| `handleShare()` | 29-35 | If `timelineId` exists, copies `{origin}/view/{timelineId}` to clipboard and shows `alert('Share link copied to clipboard!')` |
| `handleFeedbackClick(e)` | 37-40 | Prevents default, sets `isHelpOpen = true` |
| `handleEmailClick(e)` | 42-46 | Prevents default, navigates to `mailto:alex@timeline.academy` with encoded subject |
| `handleVideoTutorialClick(e)` | 48-51 | Prevents default, sets `isVideoTutorialOpen = true` |

---

## Styling Summary

| Property | Value |
|----------|-------|
| Outer container | `bg-black` |
| Inner container | `mx-auto px-8 py-2 flex justify-between items-center relative` |
| Logo centering | `absolute left-1/2 -translate-x-1/2` |
| Transitions | All interactive elements use `transition-colors` |
| Responsive | None — no mobile breakpoints, renders same at all screen sizes |
| Theme | Dark only (no light mode support) |

---

## Dependencies

| Import | Source | Usage |
|--------|--------|-------|
| `React, useState` | react | Component + state |
| `Menu, X, Video` | lucide-react | Icons for hamburger, close, and video |
| `useAuth` | `../../contexts/AuthContext` | Gets `user` (currently unused in render) |
| `Modal` | `../Modal/Modal` | Wraps the Quick Tutorial content |

---

## Quirks and Notes

1. **Dead props**: `onSignInClick` and `onSignUpClick` are defined in the interface, destructured, and passed by App.tsx — but never referenced in GlobalNav's JSX. App.tsx wires them to open the AuthModal, but GlobalNav never triggers them.

2. **`useAuth` import is not used for rendering**: `user` is destructured from `useAuth()` but never referenced in the component's JSX or methods. It could be removed without affecting behavior.

3. **Duplicate title editing**: The title is editable in the GlobalNav inline input AND in the large `TimelineTitle` component below. Both write to the same `title` state in App.tsx via `setTitle`. Changes in one are immediately reflected in the other.

4. **Share confirmation uses `alert()`**: The clipboard copy success notification is a browser `alert()`, not a toast or custom notification.

5. **No clipboard fallback**: Uses `navigator.clipboard.writeText()` directly without a fallback for older browsers.

6. **No mobile responsiveness**: Unlike the FloatingToolbar (which has distinct mobile/desktop layouts with `hidden md:flex` / `flex md:hidden`), GlobalNav renders the same layout at all screen sizes. On small screens, left and right sections may collide with the centered logo.
