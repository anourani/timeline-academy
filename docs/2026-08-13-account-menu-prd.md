# The account menu — redesigning the bottom of the left panel — 13 August 2026

Product requirements for replacing the side panel's footer strip with a single account row and a menu,
modelled on the pattern Claude uses in the same position. Written before the implementation rather than
alongside it, so section 8 is a list of things to prove rather than a record of things proven.

---

## 1. Summary

The bottom of the left side panel (`SidePanelBody.tsx:664-702`) has accumulated rather than been
designed. Below the `UsageLimits` card sits a footer holding the signed-in user's email beside an
unlabelled `LogOut` glyph, and under that a row of three 12px text links: **Privacy**, **Terms**, and —
pushed to the right edge with `ml-auto` — **Delete account**.

Three problems, in descending order of how much they matter:

- **Account deletion is styled as a link to the privacy policy.** It is one click from a confirmation
  dialog, rendered at the same size, weight and colour as the two navigational links beside it. The only
  thing separating the irreversible action from the legal boilerplate is a `hover:text-destructive`.
- **Sign-out is an unlabelled icon.** A 16px `LogOut` glyph carrying a `title` attribute — a tooltip on
  desktop, nothing at all on touch.
- **The tier is invisible next to the identity.** `useAccountTier()` already knows whether the visitor is
  on `free` or `byok`, and the panel already renders an entire card about limits, but the line naming the
  user says nothing about what they are on.

What replaces it: **one row, pinned to the bottom**, showing an avatar, the user's name and their tier,
and a chevron. Clicking it opens a menu upward carrying **Settings**, **Account Details**, **Learn more**
(a submenu holding Privacy Policy and Terms & Conditions), **Log Out** and **Delete Account**. The row
renders for signed-out visitors too, with a reduced menu, because `byok-anon` is a real tier with real
drafts and the panel is its only route to sign-in.

Two things this deliberately does not touch: **the Settings panel**, which keeps its current contents and
its current entry points, and **`UsageLimits`**, which is phase 2 (section 9). The tier model is unchanged.
No SQL, no migration, no edge function — which is the main reason this can land without going near the
part of the system that has historically drifted.

---

## 2. Product decisions

| Decision | Choice | Why |
|---|---|---|
| Menu mechanism | Add `@radix-ui/react-dropdown-menu`; new `ui/dropdown-menu.tsx` | The submenu, roving focus, typeahead and Escape handling all come with it. The alternative is re-deriving four behaviours by hand |
| Positioning | Portal, `side="top"`, `align="start"`, anchored to the row | `GlobalSidePanel.tsx:11` sets `overflow-hidden`; anything positioned in-flow is clipped |
| Menu width | Wider than the panel, overlapping the canvas | Matches the reference. A menu capped at the panel's own width wraps its labels at `PANEL_MIN_WIDTH` |
| Legal links | New tab, with an `↗` affordance | `/privacy` and `/terms` render *outside* the layout — an in-tab link destroys editor state |
| Delete Account | Stays in the menu, below a divider, on `text-destructive` | Where it was asked for. Separation and colour carry the weight the current text link does not |
| Account Details surface | **Modal**, on the existing `Modal` shell | It is a read-mostly summary, not a workspace, and the shell already portals and locks scroll |
| Settings item | Existing `onOpenSettings()`; the panel is unchanged | No new surface and no edit to `TimelineSettingsPanel` |
| Settings visibility | Hidden wherever no handler is registered | `SidePanelContext.tsx:126-128` calls through a ref only the editor registers. A present item that silently does nothing is worse than an absent one |
| Signed-out row | Renders, with a reduced menu | `byok-anon` has drafts and limits, and the panel is its only sign-in entry point |
| Tier label | `·`-separated suffix on the row | The reference pattern. After identity, the tier is the most useful thing that line can say |
| `loading` tier | Skeleton row, menu not openable | `useAccountTier` returns `'loading'` before auth answers; rendering "Guest" in that window mislabels a signed-in user |
| Identity string | Email local-part on the row, full address in the menu header | What both reference screenshots do, and a full address does not fit the narrowest card |

**Rejected: building the menu on `popover.tsx`.** It is already installed and already portalled, so the
saving is one dependency. But `Popover` is a positioned surface, not a menu: no submenu, no arrow-key
traversal, no typeahead, no `role="menu"` semantics. That is one package weighed against a menu's entire
keyboard contract — and the hand-rolled menu already in this file shows how that trade ends.
`TileMenuButton` (`SidePanelBody.tsx:45-151`) closes on a `document` click listener, traps no focus, and
cannot be reached from the keyboard at all.

**Rejected: extending `TileMenuButton` into a shared menu component.** The same reasoning from the other
side. It is fine for a five-item flyout nobody tabs to; the account menu needs a submenu on the first day.

---

## 3. Four constraints the panel imposes

These are properties of the code as it stands, not preferences. Each one rules out an implementation that
would otherwise look obvious.

**The panel clips its own children.** `GlobalSidePanel.tsx:11` is
`h-full w-full bg-[#171717] rounded-[6px] border … flex flex-col overflow-hidden`. A menu rendered inside
the panel's DOM cannot exceed the panel's bounds, and the reference design is explicitly wider than the
panel and overlaps the canvas to its right. The menu must go through a portal — which is half the
argument for the Radix dependency, since `DropdownMenu.Portal` does it by default.

`Modal.tsx:33-36` already documents the same hazard from the other direction, and its comment is worth
quoting because it names a second trap this work will meet:

> Portal to body so we escape any ancestor with a `transform` (e.g. the sliding side panel), which would
> otherwise become the containing block for `position: fixed` and trap us inside the panel.

**The legal routes are outside the layout.** `Router.tsx:20-41` puts `/` and `/editor` inside
`LayoutRoute` — which owns `SidePanelProvider` and `GlobalLayout` — and mounts `/privacy` and `/terms` as
siblings of it, not children. Navigating to either through the footer's current `<Link>` therefore unmounts
the editor entirely. Opening them in a new tab is both the fix and a match for the `↗` affordance in the
reference.

**`onOpenSettings()` is a no-op outside the editor.** `SidePanelContext.tsx:126-128` calls through a ref
that only the editor route registers. On `/` and in the viewer the ref is null and the call does nothing,
silently. The menu must be able to tell — hence `hasSettingsHandler` in section 7.

**Sign-out from this panel skips the cache purge.** `handleSignOut` (`SidePanelBody.tsx:374-384`) calls
`supabase.auth.signOut()` directly. `AuthContext`'s own `signOut` (`AuthContext.tsx:26-39`) wraps the same
call in a `finally` that runs `clearAllCachedEvents()`, with the comment "Don't leave a browsing record of
viewed shared timelines behind after the account signs out." So events cached from shared timelines survive
a sign-out taken from the side panel, but not one taken elsewhere. Small, real, and free to fix while this
code is being rewritten anyway.

---

## 4. The row

Anatomy, left to right: a 24px avatar circle, the identity string, a `·`, the tier label, and a chevron
pushed to the right edge. The whole row is one button; the chevron is decoration, not a second target.

| `useAccountTier()` | Avatar | Identity | After the `·` |
|---|---|---|---|
| `loading` | skeleton | skeleton | — |
| `trial` | `User` icon | Guest | Not saved |
| `byok-anon` | `User` icon | Guest | Your API key |
| `free` | first alphanumeric of the local-part, uppercased | local-part, truncated | Free |
| `byok` | same | local-part, truncated | Your API key |

The identity string is the **local-part** of the email — everything before the `@` — truncated with an
ellipsis. The full address appears as the menu's header instead, which is what both reference screenshots
do. It is deliberately **not** capitalised or otherwise prettified: the transformations that make `alex`
look right make `o'brien` and `van der berg` look wrong, and there is no display-name field to fall back
on. Identity here is email-only by design (`CLAUDE.md`, "Access & data model").

`loading` gets a skeleton rather than a guess. `user` is null both before the session lookup answers and
when genuinely signed out, so a row that renders "Guest" in that window tells a signed-in user they have no
account — the exact trap `authReady` exists to close, and the reason `useAccountTier` exposes a `'loading'`
state at all rather than collapsing it into `trial`.

The two BYOK states share a label because they share everything that label describes: limits do not vary by
provider, and the provider is deliberately not a tier axis. Which key is in use is a detail for Account
Details, not for a 300px row.

**All display strings live in one exported map**, beside `PLAN_LIMITS`. The row, the Account Details modal
and `UsageLimits` all name these states, and three files inventing their own wording is how "Your API key"
becomes "BYOK" in one place and "API Key Connected" in another. This is the pattern
`src/constants/byokProviders.ts` already establishes for provider names, and it exists for the same reason.

---

## 5. The menu

Opens upward, anchored to the row, portalled to the body.

**Signed in** (`free`, `byok`):

| Item | Action |
|---|---|
| *header* — full email address | not interactive |
| Settings | `onOpenSettings()` — hidden where unregistered |
| Account Details | opens the modal in section 6 |
| — divider — | |
| Learn more → | submenu: **Privacy Policy ↗**, **Terms & Conditions ↗** |
| — divider — | |
| Log Out | `ConfirmationModal`, then `AuthContext.signOut()` |
| Delete Account | `ConfirmationModal`, then the `delete-account` function |

**Signed out** (`trial`, `byok-anon`): Settings, Learn more, a divider, then **Sign in** in place of Log
Out. No Account Details, no Delete Account — there is no account to detail or delete. Sign-in reuses
`AuthModal`, already imported at `SidePanelBody.tsx:25`.

Both legal items are anchors with `target="_blank"` and `rel="noopener noreferrer"`, for the routing reason
in section 3. They are the only items in the menu that leave the app, and the `↗` says so.

Visually the menu inherits from the one that already exists in this file rather than from the shadcn
defaults: `bg-[#171717]`, `border-[#404040]`, `rounded-md`, the
`drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))` at `SidePanelBody.tsx:84`, 14px items on `text-[#c9ced4]`,
`hover:bg-white/5`, destructive items on `text-destructive`. Worth flagging before it is generated rather
than after: the shadcn `--popover` token (`index.css:21`, `217 33% 17%`) is a **blue-tinted slate**, not
the panel's neutral grey. `ui/dropdown-menu.tsx` will reach for it by default, and the result will be
subtly and inexplicably blue against the panel unless it is overridden.

---

## 6. Account Details

A **modal**, built on `src/components/Modal/Modal.tsx` — the shell `ApiKeyModal` and `TrialGateModal`
already use. It portals to body, locks scroll via `lockScroll`/`unlockScroll`, renders a titled header with
a close button, and offers three widths; `compact` (420px) or `default` (550px) both fit this content.

Four sections:

**Identity** — the email address, and how it authenticates: passwordless email OTP, six-digit codes. Worth
stating plainly, because "there is no password" is a question this modal should answer before it is asked.

**Tier** — which state the visitor is in and what it grants, using the same strings as the row.

**Usage** — events and timelines against their caps. `useEventUsage()` already returns
`{eventCount, eventLimit, timelineCount, timelineLimit, isLoading, refetch}`, and `PLAN_LIMITS`
(`plans.ts:15-20`) already holds the caps.

**API key** — status only: which provider is active, the masked key, and a pointer to Settings. The
management UI itself stays in `TimelineSettingsPanel:262` and is not moved or duplicated. `maskKey` and
`useByokCredential` in `services/userApiKey` supply everything this section needs.

Delete Account repeats here as a destructive footer, below a rule. Two entry points to a destructive action
is not redundancy — the menu item is for someone who knows what they want, the modal footer for someone who
arrived to read what deletion means first.

Every value on this modal already exists. **There is no new query, no new table and no new hook.**

One note for implementation, not a requirement: the `Modal` shell's palette (`bg-gray-800`,
`border-gray-700`) predates the current tokens and does not match the panel. Whether to bring it in line
here or leave it consistent with the other two modals is a judgement call at build time.

---

## 7. What changes

**New.** `ui/dropdown-menu.tsx` (the shadcn primitive, re-themed per section 5).
`SidePanel/AccountRow.tsx` and `SidePanel/AccountMenu.tsx`. `Modal/AccountDetailsModal.tsx`. One constants
module for the tier display strings.

**Modified.** `SidePanelBody.tsx`: the footer at 669-702 is deleted and replaced by the row. The three
`ConfirmationModal`s at 704-735 and their handlers at 374-406 are **kept and re-pointed** — the copy in
them is already correct, particularly the deletion warning, and rewriting correct copy while relocating it
is how it stops being correct. `SidePanelContext.tsx` gains a `hasSettingsHandler` boolean so the menu can
tell whether the Settings item has anywhere to go. `package.json` gains one dependency.

**Fixed.** `handleSignOut` switches to `AuthContext.signOut()`, so `clearAllCachedEvents()` runs. See
section 3.

**Untouched, by decision.** `TimelineSettingsPanel.tsx`, `ApiKeySection.tsx`, `UsageLimits.tsx`.

---

## 8. Verified vs. unverified

Following the convention in `2026-08-07-verification-runbook.md`: shipped is not the same as verified.
This is a PRD, so everything below is unverified by definition. The list is what the implementation pass has
to prove.

1. **The menu escapes the panel.** At both ends of the resizable range — `PANEL_MIN_WIDTH` (300) and
   `PANEL_MAX_WIDTH` (400), so cards of 294px and 394px once the 6px float gap is taken out — the menu
   renders wider than the panel and overlaps the canvas without clipping. This is the single most likely
   thing to be wrong, because it fails only visually and the `overflow-hidden` causing it is three files
   away from the menu.
2. **The submenu opens sideways and stays open** while the pointer crosses the gap to it.
3. **Keyboard traversal end to end**: open with Enter, arrow through items, into and out of the submenu,
   Escape closes one level at a time, focus returns to the row.
4. **The `loading` window never renders "Guest".** Hard-reload as a signed-in user on a throttled connection
   and watch the row. This is the failure that looks like a logout bug.
5. **Legal links open new tabs with editor state intact** — make an unsaved edit, open Privacy, return to
   the original tab, confirm the edit is still there.
6. **Sign-out clears the viewer cache.** View a shared timeline, sign out from the menu, confirm the cached
   events are gone.
7. **All four tier states render the right row and the right menu**, including `byok-anon`, which is the
   state most easily forgotten because it requires a key and no account.

**A correction to carry forward.** `CLAUDE.md` lists account deletion among paths "deployed but never
exercised". **That is stale.** `2026-08-07-verification-runbook.md` records `delete-account` as **VERIFIED
end-to-end on 7 August**, against a real account: eight columns confirmed at zero afterwards, both cascades
observed firing, and the `timeline_categories` row inserted by hand beforehand precisely so the test was
real rather than an empty table matching an empty table. So the function is not the risk here.

What *is* thin is the reporting around it. `handleDeleteAccount` announces both success and failure through
`alert()` (`SidePanelBody.tsx:398,401`) — browser chrome standing in for the confirmation of an irreversible
action. Making that action more discoverable is a reason to improve the reporting, not a reason to hide the
action.

**The type-check gate.** `npm run build` is `vite build` alone and does not type-check.
`npx tsc --noEmit -p tsconfig.app.json` is the real gate. There are 16 pre-existing errors in the
repository; none should be in files this change touches.

---

## 9. Phase 2 — the usage card

`UsageLimits` sits directly above this footer and is the other half of the bottom of the panel. It is
untouched here on purpose: it is a carefully-built surface with four tier-dependent variants, and folding it
into the same change would make the diff hard to review for no gain in either.

The follow-up is to reduce it to a single compact line above the account row, and move the tier comparison
table into the Account Details modal, where there is room for it.

The constraint that governs that work: the CTAs in `renderHeaderCta` (`UsageLimits.tsx:190-222`) — "Log In"
for `byok-anon`, "Add API Key" for `free` — are the product's entire upgrade path, and `TrialStatus`
(`UsageLimits.tsx:236-273`) is the only sign-in entry point a trial visitor has anywhere in the panel. Its
own comment records that hiding it until the visitor had made something left first-time visitors with no way
to log in at all. Neither may end up two clicks deep.

---

## 10. Decisions worth not re-litigating

- **The portal is mandatory, not stylistic.** `GlobalSidePanel`'s `overflow-hidden` is what makes the
  floating panel frame work, and the panel's `transform` would capture a `position: fixed` menu even without
  it. The menu goes through a portal; the panel does not change.
- **The legal links open new tabs because of the router**, not because external-link styling looks nice.
  `/privacy` and `/terms` are mounted outside `LayoutRoute` and an in-tab navigation unmounts the editor. If
  they ever move inside the layout, revisit — until then this is load-bearing.
- **The Settings panel and `ApiKeySection` are untouched by decision**, not by omission. Account Details
  shows key *status* and points at Settings; it does not duplicate the management UI.
- **The email local-part is not capitalised or prettified.** There is no display-name field, and every
  transformation that flatters one name mangles another.
- **Trial is still not a tier.** It gets a row and a label, not a plan. `plans.ts:4-8` holds the three
  durable tiers and this change does not add a fourth.
- **The existing confirmation copy is kept**, particularly the deletion warning, which already names what is
  lost and suggests exporting first.
- **The tier strings live in one module.** Three surfaces name these states; three surfaces inventing their
  own wording is the drift this repo has been bitten by before.
