// Motion tokens for code that animates through the Web Animations API.
//
// The curves mirror the three CSS custom properties in `src/index.css`
// (`--ease-enter`, `--ease-swipe`, `--ease-pop`). They are repeated here
// because `element.animate()` takes an easing string and cannot resolve a
// `var(--…)`. Change one, change both.

/** easeOutCubic — arrivals: things settling into place. */
export const EASE_ENTER = 'cubic-bezier(0.33, 1, 0.68, 1)'
/** easeInOutQuart — departures and long travel. */
export const EASE_SWIPE = 'cubic-bezier(0.76, 0, 0.24, 1)'
/** easeOutBack — the one overshoot, for things that spring in. */
export const EASE_POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

/**
 * The event view's open and close choreography
 * (docs/2026-11-24-event-view-prd.md §4). Milliseconds from the click.
 */
export const EVENT_VIEW_MOTION = {
  /** The clicked bar grows into the page. */
  morph: 700,
  /** The same growth below `md`, where the distance is shorter. */
  morphPhone: 650,
  /** Its fill turns from the bar's tint to the page background. */
  morphFill: 500,
  /** The timeline behind fades while it pushes back. */
  pushFade: 450,
  /** How far the timeline pushes back. */
  pushScale: 1.15,
  /** Title block and top bar arrive. */
  headerAt: 550,
  /** Photo viewer arrives. */
  photoAt: 650,
  /** First content column arrives; each further one follows `contentStagger` later. */
  contentAt: 800,
  contentStagger: 90,
  /** Each staged element's fade and rise. */
  stageFade: 450,
  stageRise: 650,
  /** Close: content fades first, then the page shrinks back into the bar. */
  closeFade: 150,
  closeMorph: 450,
  /** No bar to grow from: fade and rise instead. */
  fallback: 300,
  /** prefers-reduced-motion: a plain crossfade. */
  reducedIn: 150,
  reducedOut: 120,
} as const
