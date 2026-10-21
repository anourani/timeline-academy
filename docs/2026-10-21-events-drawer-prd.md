# Events editor: full-height drawer

PRD · Shipped · Oct 21, 2026 · design direction **2a** in *Events Table Redesign*

| | |
|---|---|
| Component | `src/components/EventTableEditor/EventTableEditor.tsx` |
| Shared styles | `src/components/ui/glassButton.ts` |
| Surfaces | Desktop (≥ `sm`) and mobile (< `sm`). Edit and view modes. |
| How it works now | `src/TIMELINE_ARCHITECTURE.md` §Events Drawer |

Replaces the centred Events / Categories modal with a 95%-height bottom drawer. Adds row numbers, sortable Start and End Date columns, a filter row, and a clear way to reach Categories.

## 1. Problem

- The modal was capped at 960 × 640. Long titles were cut off at 240px, and only about ten rows fit.
- Rows had no numbers, so you couldn't refer to an event ("row 7") or see how many there were.
- Events showed in the order they were added. Nothing sorted them by date, so the list didn't match the timeline it edits.
- The left rail did two jobs (page tabs and category filters), which took up width and blurred them together.

## 2. Goals and non-goals

**Goals**
- Use nearly the full viewport for the table on every screen size.
- Number every row, and sort by Start Date and End Date in either direction.
- Make Categories reachable in one click from anywhere in Events.
- Borrow from the timeline (category colour bars, mono dates) so the editor feels like part of it.

**Non-goals**
- Changing the event or category data model, or how saving works (draft, then Save).
- Search, bulk select, multi-column sort. Candidates for later.
- Changing the 4-category limit or the AI-generated timeline restrictions.

## 3. Decisions on the open questions

The draft PRD left three questions open. They were settled before implementation:

| Question | Decision |
|---|---|
| Mobile editing: tap a row to open an editor sheet, or expand it in place? | **Neither. Event rows are read-only below `sm`.** No tap-to-edit, no floating Add Event, no delete. The Categories tab stays fully editable on mobile, with Cancel and Save. |
| Should drag-to-dismiss (P2) ship in v1? | **Yes.** Dragging the grabber down more than 80px closes the drawer. If there are unsaved changes it springs back and asks "Discard changes?" first. |
| Should the filter allow several categories at once? | **No.** One at a time, as before. |

Because mobile event rows are read-only, §4.2's "Add Event is a floating glass button at the bottom" on mobile was dropped. §4.4's "tapping a row opens it for editing" was dropped as well.

## 4. Requirements

P0 = must have for launch · P1 = should have · P2 = nice to have. All P0, P1 and P2 items below shipped, with the mobile changes from §3.

### 4.1 Container
- **P0** At every breakpoint the dialog is a bottom drawer: `fixed inset-x-0 bottom-0 h-[95dvh] w-screen rounded-t-[20px] border-t border-[rgba(210,210,210,0.2)] bg-[#171717]`. The top 5% of the timeline stays visible behind the existing `bg-black/80` overlay.
- **P0** It opens with `slide-in-from-bottom` and closes with `slide-out-to-bottom` (duration-200). This replaces `zoom-in-95`.
- **P0** Esc, clicking the overlay, and Cancel all close the drawer and discard the draft, as before.
- **P2** Dragging the grabber (40 × 4, `#3D3E40`) down dismisses the drawer. If there are unsaved changes, it asks first.

### 4.2 Header and navigation
- **P0** Remove the left rail. "Events" and "Categories" become header tabs in Aleo 28px (mobile 22px). The active tab is `#dadee5` with a 2px `#2563eb` underline; inactive tabs are `#6b6e73`. Each tab shows a mono count: "14 events" (or "5 of 14" when filtered) and "4 of 4".
- **P0** Tabs use `role="tablist"` / `role="tab"` with `aria-selected`. Arrow keys move between tabs.
- **P0** Header actions sit on the right: Add Event (or Add Category on that tab), a divider, Cancel, then Save (`primaryGlassButtonClass`). These replace the footer row. On mobile, Cancel sits top-left and Save top-right.
- **P0** The `initialView` prop still works. The dock legend's "Edit categories" opens the Categories tab.
- **P0** View mode: no Categories tab, no add or delete controls, and the only action is Close.

### 4.3 Category filter row (Events tab)
- **P0** Chips: All, then one per category in category order. Each has a 4 × 14 colour bar, a label and a mono count. Selecting one filters the table, one at a time. The active chip uses `bg-[rgba(37,99,235,0.4)]`; inactive chips have a `border-white/12` outline.
- **P0** The last item is an "Edit categories →" button with a dashed outline that switches to the Categories tab. On mobile it reads "Edit →" and sits at the end of the scrolling chip strip.
- **P0** On mobile the row scrolls sideways with no visible scrollbar. Chips are 40px tall.

### 4.4 Events table
- **P0** Desktop columns: `56px | 1fr | 150px | 150px | 220px | 44px` (# · Title · Start Date · End Date · Category · delete). 32px horizontal padding.
- **P0** Rows are flat, at least 52px tall, with a `rgba(210,210,210,0.07)` hairline between them. On hover the background becomes `white/3%`. This replaces the `#242526` boxed rows.
- **P0** Each title cell starts with a 4 × 22 category colour bar. Titles are Avenir 15 `#dadee5` and end in an ellipsis on desktop. They stay editable inputs with the existing hover and focus fill (`#151617`).
- **P0** Dates are JetBrains Mono 13 in MM/DD/YYYY and still open the existing `DatePickerCell` popover. When End Date equals Start Date, End Date is shown in `#6b6e73`.
- **P0** Category is a pill tinted with the category colour at 18% alpha. It is still the trigger for the existing Select.
- **P0** The column header row stays fixed while the rows scroll inside the drawer.
- **P1** Events in a hidden category show at 40% opacity, so you can still see and edit them.
- **P0** Mobile rows use three columns: number · 4px colour bar · stack. The stack holds the title (wraps), the date range in mono ("06/01/2001 → 08/31/2001", or one date for a single-day event), and the category label. Rows are read-only (§3).

### 4.5 Row numbers
- **P0** The number is the row's position in the current sorted and filtered list, starting at 1. Zero-padded to two digits (three when there are more than 99 events). JetBrains Mono 12, `#6b6e73`.
- **P0** Numbers are display-only. They are not stored, and they renumber whenever the sort or filter changes.

### 4.6 Sorting
- **P0** Sort by Start Date or End Date. Clicking an inactive header sorts ascending; clicking the active header flips the direction.
- **P0** Default is Start Date ascending. Ties sort by the other date, then by title.
- **P0** Each header shows an arrow (lucide `ArrowUp`, 13px), rotated 180° for descending. The active header's text is `#dadee5` with its arrow fully opaque; the inactive one is `#9b9ea3` with its arrow at 30%.
- **P0** Headers are `<button>`s, and each column header carries `aria-sort`.
- **P0** Sorting changes the display only. It does not reorder `draftEvents` or the saved data.
- **P0** Blank rows added with Add Event stay at the bottom whatever the sort. A row joins the sorted list once it is valid. Re-sort on blur or commit, not on every keystroke, so a row doesn't jump while you edit it.
- **P0** On mobile, sorting is two pill buttons, "Start" and "End" (36px tall), below the chips.
- **P1** The sort choice is remembered for the session (`sessionStorage`, key `timeline_events_sort`) and applies the next time the drawer opens.

### 4.7 Categories tab
- **P0** Desktop columns: `28px | 56px | 1fr | 300px | 180px` (drag handle · # · title · colour · actions). Rows are at least 84px tall and flat, with a hairline between them.
- **P0** The title has an 8 × 34 colour bar and an inline Aleo 22 input. Rename rules don't change: names can't be empty and can't duplicate another category, ignoring case.
- **P0** The colour picker shows the five `COLOR_PALETTE` swatches spread evenly across the 300px column, 56px tall. Unselected swatches are 64% height at 50% opacity. The selected one is full height with a 1px ring in its own colour, offset 2px. Selecting a swatch immediately recolours that category's rows on the Events tab, still inside the draft.
- **P0** Actions are a Hide/Show glass button and an icon-only delete button with an aria-label. A hidden category's row gets a `#151617` background and its contents drop to 40% opacity.
- **P0** Drag-to-reorder uses the existing dnd-kit setup (vertical axis). Below `sm`, use press-and-hold, because swiping already scrolls.
- **P0** "Add Category" is disabled at 4 categories, with a tooltip saying why. A "4 of 4 categories used" note sits under the list. The AI-timeline rules don't change.
- **P0** On mobile each category is a card (`#1c1d1e`, 14px radius). The top row has the number, colour bar, name, event count, Hide/Show and delete. Below it, a full-width row of swatches 52px tall.

### 4.8 Accessibility
- Every touch target on mobile is at least 44px. Chips and sort pills stay at 36–40px with a 44px hit area.
- Focus starts on the active tab and stays inside the drawer (Radix handles this). Focus rings use `ring-1 ring-white/40`.
- Colour is never the only way to tell categories apart: every category colour also appears with its text label.
- With `prefers-reduced-motion`, the drawer fades in instead of sliding.

## 5. Implementation notes

- The `DialogPrimitive.Content` grid (`grid-cols-[200px_…]` plus rail) became a flex column: grabber → header (tabs + actions) → tab body. `modalRailClass` and the related styles are no longer used here, but `AccountDetailsModal` still uses them, so they stay in `glassButton.ts`.
- Sorting happens in a memo after filtering and before the blank rows are appended. YYYY-MM-DD strings compare correctly as plain strings.
- The row number is the index in the sorted list + 1, blank for empty draft rows.
- The category chip counts come from `draftEvents`, so they update while editing.
- `useIsNarrow` picks the dnd-kit sensors and decides whether event rows are editable. Mobile layouts switch at the existing `sm` breakpoint.
- To keep rows from jumping (§4.6): the focused row's title is frozen for sorting until blur, and a blank row joins `draftEvents` on a commit (blur, or a date/category pick) rather than a keystroke, keeping its id so focus survives.

### Tokens used (all already in `index.css` or the component)

| Role | Value |
|---|---|
| Drawer surface | `#171717` (`--surface-color-secondary`) |
| Input fill / hidden row | `#151617` (`--surface-color-tertiary`) |
| Text primary / secondary / tertiary / muted | `#DADEE5` / `#C9CED4` / `#9B9EA3` / `#6B6E73` |
| Lines | `rgba(210,210,210,0.2)` header · `0.12` section · `0.07` row |
| Active / primary | `rgba(37,99,235,0.4)` · `rgba(37,99,235,0.8)` · `#2563eb` |
| Type | Aleo (titles, tabs) · Avenir (body) · JetBrains Mono (dates, numbers, headers) |

## 6. Acceptance criteria

1. The editor opens as a drawer 95dvh tall and full width on desktop and mobile.
2. Clicking Start Date sorts oldest to newest; clicking it again sorts newest to oldest. End Date works the same way. The arrow shows the current direction.
3. The numbers run 1…N down the visible rows and renumber when the sort or filter changes.
4. From the Events tab, Categories can be reached in one click, through the header tab or "Edit categories".
5. Recolouring or hiding a category is reflected on the Events tab before Save. Cancel discards everything.
6. View mode and AI-generated timelines behave as before: the same buttons are disabled with the same tooltips.
7. Saving never changes the stored order of events.
8. On mobile, the Events tab has no editable fields, no Add Event and no delete; the Categories tab can still be edited and saved.

## 7. Errata in the original draft

- Figure 1 was captioned "Desktop, Events tab", and the left half of Figure 3 "Mobile, Events tab", but both images show the Categories tab. The Events-tab layouts were built from the written requirements in §4.3–4.6.
