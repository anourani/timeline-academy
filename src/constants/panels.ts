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

/** Gap between a panel's card and the viewport edge. */
export const PANEL_GAP = 6

/**
 * Narrowest a panel may be dragged. Below roughly 250px the usage table in
 * `SidePanel/UsageLimits.tsx` (a 140px wrapper around two 65px columns)
 * overflows its row, so this leaves a little margin above that floor.
 */
export const PANEL_MIN_WIDTH = 260

/** Widest a panel may be dragged, before the viewport clamp below applies. */
export const PANEL_MAX_WIDTH = 640

/**
 * Content that must stay visible beside a panel. Small enough that phones keep
 * roughly the full-width panel they have today, large enough that a panel can
 * never swallow the viewport outright.
 */
export const MIN_CONTENT_GUTTER = 64

/** Default footprint for the left timelines panel and the event details panel. */
export const PANEL_DEFAULT_WIDTH = 320

/**
 * Settings runs wider than its siblings — the scale selectors and the BYOK key
 * rows were cramped at 314px.
 */
export const SETTINGS_PANEL_DEFAULT_WIDTH = 400

/**
 * Widest a panel may actually go right now. `PANEL_MAX_WIDTH` is the ceiling;
 * on a narrow viewport the gutter wins instead, which is what keeps the 400px
 * Settings default from overflowing a ~390px phone.
 */
export function maxPanelWidth(viewportWidth: number): number {
  return Math.max(
    PANEL_MIN_WIDTH,
    Math.min(PANEL_MAX_WIDTH, viewportWidth - MIN_CONTENT_GUTTER)
  )
}

/**
 * Clamp a width into range. Applied to every source of one — a value read back
 * from storage, a live drag, and a window resize — so no path can strand a
 * panel wider than its viewport.
 */
export function clampPanelWidth(width: number, viewportWidth: number): number {
  return Math.min(Math.max(width, PANEL_MIN_WIDTH), maxPanelWidth(viewportWidth))
}
