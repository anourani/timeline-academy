/**
 * Side panel geometry.
 *
 * Every panel — the left timelines panel, Settings, Feedback and Event details
 * — is a fixed `<aside>` whose width *includes* a 6px gap that floats the
 * visible card off the viewport edge. A panel of width 320 therefore renders a
 * 314px card.
 *
 * Before panels became resizable this number was four independent literals
 * (plus two more for the left panel's push layout: GlobalLayout's content
 * padding and FloatingToolbar's recentering). Keeping them in sync by hand is
 * exactly what this module exists to end — nothing should hard-code a panel
 * width again.
 */

/**
 * Narrowest a panel may be dragged. A deliberate floor rather than a content
 * limit — the panels stay usable below this, but not usefully so. Desktop
 * only; see `clampPanelWidth`.
 */
export const PANEL_MIN_WIDTH = 300

/** Widest a panel may be dragged. */
export const PANEL_MAX_WIDTH = 400

/**
 * Matches the `md:` breakpoint the resize handles appear at
 * (`ui/PanelResizeHandle.tsx` is `hidden md:block`). Tailwind's default —
 * `tailwind.config.js` does not override `theme.screens`.
 */
export const PANEL_RESIZE_BREAKPOINT = 768

/**
 * Content that must stay visible beside a panel below the breakpoint, so a
 * stored desktop width can't leave a phone with nothing but panel.
 */
export const MIN_CONTENT_GUTTER = 64

/** Default footprint for the left timelines panel and the event details panel. */
export const PANEL_DEFAULT_WIDTH = 320

/**
 * Settings opens wider than its siblings — the scale selectors and the BYOK
 * key rows were cramped at the 314px card. Kept below `PANEL_MAX_WIDTH` so it
 * has room to move in both directions.
 */
export const SETTINGS_PANEL_DEFAULT_WIDTH = 360

/**
 * Clamp a width into range. Applied to every source of one — a value read back
 * from storage, a live drag, and a window resize — so no path can strand a
 * panel outside its bounds.
 */
export function clampPanelWidth(width: number, viewportWidth: number): number {
  // Below the breakpoint the handles are hidden, so there is no user-chosen
  // width to honour and only the viewport fit matters. Applying the desktop
  // floor here would force 300px onto a 320px phone.
  if (viewportWidth < PANEL_RESIZE_BREAKPOINT) {
    return Math.min(width, Math.max(0, viewportWidth - MIN_CONTENT_GUTTER))
  }
  // At or above the breakpoint the viewport always allows at least
  // 768 - 64 = 704px, comfortably more than PANEL_MAX_WIDTH, so the gutter can
  // never bind here and the bounds are the whole rule.
  return Math.min(Math.max(width, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH)
}
