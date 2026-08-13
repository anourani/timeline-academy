# The account menu — redesigning the bottom of the left panel — 13 August 2026

Product requirements for replacing the side panel's footer strip with a single account row and a menu,
modelled on the pattern Claude uses in the same position. Written before the implementation and then kept
current through it, so section 8 records what was actually proven — including the two places the spec was
wrong and what replaced it.

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
| Account Details surface | **Modal**, on the `EventTableEditor` shell with a section rail | A modal because it is a read-mostly summary, not a workspace; that shell because the product should not grow a second full-size modal design |
| Menu modality | `modal={false}` | Every item opens another Radix layer, and a modal menu strands `pointer-events: none` on `<body>` when that layer unmounts. See section 7 |
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

A **modal on the `EventTableEditor` shell** — Radix Dialog rather than the `Modal` wrapper, 720px wide,
20px radius on `#171717`, an Aleo 24px header band, a 200px left rail of sections, and a glass-button
footer. The two full-size modals in the product should read as one surface, so the button and tab styles
live in `ui/glassButton.ts` and `EventTableEditor` imports them rather than keeping its own copies.

The rail carries three sections — **Account details**, **Account usage**, **Account management** — and
reopening always lands on the first, since the menu item that opens it is called "Account Details" and
arriving on the delete screen is not what that promised.

Their contents:

**Account details** — the email address, how it authenticates (passwordless, a six-digit code each time —
worth stating plainly, because "there is no password" is a question this pane should answer before it is
asked), and the join date from `user.created_at`.

There is **no name field**, and the pane does not pretend otherwise. Identity here is email-only by design:
sign-up collects an address and nothing else, so a "Name" row would either sit permanently empty or invent
a value the account does not have.

**Account usage** — the tier and what it grants, using the same strings as the row; events and timelines
against their caps; and API key *status* — which provider is active and the masked key. `useEventUsage()`
supplies the counts and `PLAN_LIMITS` (`plans.ts:15-20`) the caps. Key management itself stays in
`TimelineSettingsPanel:262`; this pane links to it rather than duplicating it.

**Account management** — Delete Account, with room for the full warning the menu item cannot carry: what
is lost, that it cannot be undone, and where to export first. Two entry points to a destructive action is
not redundancy — the menu item is for someone who knows what they want, this pane for someone who arrived
to read what deletion means.

Every value on this modal already exists. **There is no new query, no new table and no new hook.**

---

## 7. What changes

**New.** `ui/dropdown-menu.tsx` (the shadcn primitive, re-themed per section 5).
`SidePanel/AccountRow.tsx` and `SidePanel/AccountMenu.tsx`. `Modal/AccountDetailsModal.tsx`. One constants
module for the tier display strings, and `ui/glassButton.ts` for the modal-shell button and rail styles
shared with `EventTableEditor`.

**One non-obvious requirement.** The account menu must be `modal={false}`. As a modal layer a Radix
DropdownMenu writes `pointer-events: none` onto `<body>` while open, and every item in this menu opens a
second Radix layer — the Account Details dialog, or a `ConfirmationModal` for Log Out and Delete Account.
When that second layer unmounts it restores the style it found on mount, which is the menu's `none`: the
page then looks normal and silently ignores every click. Non-modal means the menu never writes the style,
so there is nothing stale to restore. Only inerting the page behind a small account menu is given up.

**Modified.** `SidePanelBody.tsx`: the footer at 669-702 is deleted and replaced by the row. The three
`ConfirmationModal`s at 704-735 and their handlers at 374-406 are **kept and re-pointed** — the copy in
them is already correct, particularly the deletion warning, and rewriting correct copy while relocating it
is how it stops being correct. `SidePanelContext.tsx` gains a `hasSettingsHandler` boolean so the menu can
tell whether the Settings item has anywhere to go. `package.json` gains one dependency.

**Fixed.** `handleSignOut` switches to `AuthContext.signOut()`, so `clearAllCachedEvents()` runs. See
section 3.

**Untouched, by decision.** `TimelineSettingsPanel.tsx`, `ApiKeySection.tsx`.

`UsageLimits.tsx` keeps its structure and every tier variant — the phase 2 in section 9 is still
outstanding — but its two numeric styles moved from JetBrains Mono to Avenir, so the counts read as part
of the labels beside them rather than as a second typeface inside one card. Monospace stays wherever a
key is shown: `ApiKeySection`, `ApiKeyModal` and the masked key in Account Details, where character
alignment is the point.

---

## 8. Verified vs. unverified

Following the convention in `2026-08-07-verification-runbook.md`: shipped is not the same as verified.

**Verified in a real browser** against `npm run dev`, driven by Playwright — 86 assertions across three
suites, all passing:

- **The menu escapes the panel.** At both ends of the resizable range — `PANEL_MIN_WIDTH` (300) and
  `PANEL_MAX_WIDTH` (400), cards of 294px and 394px once the 6px float gap is out — the menu renders
  312px and 411px wide respectively and its right edge clears the panel's. This was the flagged risk and
  it did fail first time round, though not in the predicted direction: nothing was clipped, the menu was
  simply *narrower* than the card. See the width note below.
- **The submenu opens sideways** on hover, holds while the pointer crosses the gap, and its own right edge
  (x=569) clears the panel by a wide margin — the portal works at both levels.
- **Keyboard traversal**: Enter opens, ArrowDown moves onto the first item, Escape closes, and focus
  returns to the row.
- **Legal links are real new tabs.** Both carry `target="_blank" rel="noopener noreferrer"`; opening
  Privacy loads `/privacy` in a second tab, renders its heading, and leaves the original tab on its
  route.
- **All four tier states** render the right row and the right menu: `trial` → "Guest · Not saved" with
  Sign in and no account items; `byok-anon` → "Guest · Your API key", still offering Sign in;
  `free` → "nourani1alex · Free" with Account Details, Log Out and Delete Account; `byok` → "· Your API
  key". Local-parts are left unprettified — `a.o-brien@example.com` renders as `a.o-brien`.
- **Delete Account is visually distinct**: `rgb(174, 41, 41)` against Log Out's `rgb(201, 206, 212)`.
- **The Settings item appears on `/editor` and is absent on `/`**, which is `hasSettingsHandler` doing
  its job in both directions.
- **Account Details** shows the email, the passwordless explanation, the plan, usage, key status and the
  destructive footer; on `byok` it names Anthropic and masks the key to `sk-ant-v…0000`.
- **No layer leak, on all three paths.** Closing Account Details, and cancelling either the Log Out or the
  Delete Account confirmation, each leave `body` at `pointer-events: auto` and the menu reopens
  afterwards. This did fail before `modal={false}` — the page went inert with nothing on screen to
  explain it — so it is asserted rather than assumed.
- **Account Details** opens on its first section every time, and the three rail sections show what they
  should: email / sign-in method / join date, tier / usage / key status, and the delete warning with a
  destructive button. Usage reflects the tier's real caps (25 and 1200 on `byok`, 10 and 300 on `free`).
- **`EventTableEditor` still renders with no page error** after its button styles moved to
  `ui/glassButton.ts`.

**Verified by the toolchain**: `npx tsc --noEmit -p tsconfig.app.json` reports 16 errors, the
pre-existing count, none in any file this change touches. `npm run lint` is clean.

**Two things the implementation changed from this spec, both for the better:**

1. **The menu width is `calc(var(--radix-dropdown-menu-trigger-width) + 48px)`, not a literal.** A fixed
   width cannot satisfy "wider than the panel" across a 300–400px resize range — 260px was narrower than
   the 314px default card, and any number large enough for the top of the range is oversized at the
   bottom. Measuring off the trigger keeps the overhang constant instead.
2. **Account Details reads its caps from `PLAN_LIMITS[tier]`, not from `useEventUsage`.** The hook sources
   limits from `getCurrentLimits()`, a module-level cache refreshed by an async `auth.getUser()`; it lags
   auth and key transitions by a frame and holds its `'byok-anon'` initial value if that call never lands,
   which is exactly what surfaced in testing — the modal showed a `byok` account 3 and 150 while the card
   beside it showed 25. Counts still come from the hook. This is the split `UsageLimits.tsx:45-49` already
   makes, and for the reason its comment gives.

**NOT verified — do these before trusting the feature:**

1. **The `loading` window never renders "Guest".** Needs a real session against a reachable Supabase;
   the stub environment resolves auth too fast to observe the window. Hard-reload as a signed-in user on
   a throttled connection and watch the row. This is the failure that looks like a logout bug.
2. **Sign-out clears the viewer cache.** The `AuthContext.signOut()` switch is verified by reading, not by
   running: view a shared timeline, sign out from the menu, confirm the cached events are gone.
3. **Delete Account end to end from the new entry point.** The function itself is verified (below); what
   is unexercised is this menu item reaching it.
4. **Unsaved editor state surviving a legal-link click.** Verified that the original tab keeps its route;
   not verified with actual unsaved work in the editor, which needs a working backend.

**A note on Delete Account.** `CLAUDE.md` lists account deletion among paths "deployed but never
exercised". **That is stale.** `2026-08-07-verification-runbook.md` records `delete-account` as **VERIFIED
end-to-end on 7 August**, against a real account: eight columns confirmed at zero afterwards, both cascades
observed firing, and the `timeline_categories` row inserted by hand beforehand precisely so the test was
real rather than an empty table matching an empty table. So the function is not the risk here.

What *is* thin is the reporting around it. `handleDeleteAccount` announces both success and failure through
`alert()` — browser chrome standing in for the confirmation of an irreversible action. Making that action
more discoverable is a reason to improve the reporting, not a reason to hide the action.

**The type-check gate.** `npm run build` is `vite build` alone and does not type-check.
`npx tsc --noEmit -p tsconfig.app.json` is the real gate — which is how the 16-error baseline above was
established.

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
