/**
 * The glass button styles used by the full-size modals.
 *
 * Lifted out of `EventTableEditor` when the Account Details modal adopted the
 * same shell, because two copies of a shadow-and-blur recipe drift the moment
 * either one is nudged — and these are the buttons a user sees side by side
 * across the two surfaces.
 */

/** Secondary action — Cancel, Close, Add. */
export const glassButtonClass = `
  relative min-w-[80px] px-[11px] py-[6px] rounded-[10px]
  backdrop-blur-[12px] bg-white/10 border border-white/[0.15]
  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
  font-['Avenir',sans-serif] font-medium text-[14px] text-[#c9ced4]
  hover:bg-white/20 hover:text-[#dadee5] transition-all
`

/** Primary action — Save. Same geometry, brand fill. */
export const primaryGlassButtonClass = `
  relative min-w-[80px] px-[11px] py-[6px] rounded-[10px]
  backdrop-blur-[12px] bg-[rgba(37,99,235,0.8)] border border-white/[0.15]
  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
  font-['Avenir',sans-serif] font-medium text-[14px] text-[#dadee5]
  hover:bg-[rgba(37,99,235,0.9)] transition-all
`

/** Destructive action. Same geometry so it sits in a footer row unchanged. */
export const destructiveGlassButtonClass = `
  relative min-w-[80px] px-[11px] py-[6px] rounded-[10px]
  backdrop-blur-[12px] bg-destructive/20 border border-destructive/40
  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
  font-['Avenir',sans-serif] font-medium text-[14px] text-destructive
  hover:bg-destructive/30 transition-all
`

/**
 * A tab in a modal's section rail. Active tabs take the brand fill; the rest
 * stay flat until hovered.
 *
 * Serves both orientations from one string. Below `sm` the rail is a horizontal
 * strip, where a tab must keep its intrinsic width and refuse to wrap or shrink
 * — `w-full` there would give every tab the strip's width, and a flex child's
 * default `min-width: auto` would let long labels squeeze instead of overflow,
 * which is what makes the strip scroll in the first place.
 */
export function modalSidebarTabClass(isActive: boolean): string {
  // An explicit focus ring, because the modal autofocuses its first tab on open
  // and the browser default paints a heavy halo there before the user has done
  // anything. Keyboard users still get a clear indicator, just a quieter one.
  return `
    w-auto shrink-0 whitespace-nowrap sm:w-full
    py-[9px] px-[11px] rounded-[10px] text-left
    font-['Avenir',sans-serif] font-medium text-[14px] leading-[20px] transition-colors
    border border-transparent
    outline-none focus-visible:ring-1 focus-visible:ring-white/40
    ${isActive
      ? 'bg-[rgba(37,99,235,0.4)] text-[#dadee5]'
      : 'bg-transparent text-[#c9ced4] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#dadee5]'
    }
  `
}

/**
 * The rail container: a full-height column down the left at `sm` and above, a
 * band across the top below it.
 *
 * It only stacks its groups — scrolling belongs to the groups themselves, so a
 * rail with two of them (the Events modal: pages, then category filters) gets
 * two independently scrolling strips on mobile rather than one flattened row.
 * Collapsing those into a single strip would imply they are the same kind of
 * choice.
 */
export const modalRailClass = `
  flex flex-col min-w-0
  border-b border-[rgba(210,210,210,0.2)]
  sm:w-[200px] sm:shrink-0 sm:h-full sm:p-3 sm:gap-1 sm:overflow-y-auto
  sm:border-b-0 sm:border-r sm:bg-[#141415]
`

/**
 * A group of tabs inside the rail: a horizontally scrolling strip below `sm`, a
 * plain column above it.
 *
 * `scrollbar-hide` (index.css) suppresses the bar on the strip. The signal that
 * more tabs exist is the reference's own — the strip is not padded to fit, so an
 * overflowing tab stays visibly clipped at the edge. `TIMELINE_ARCHITECTURE.md`
 * §Discoverability records what happens when a hidden scrollbar is the *only*
 * thing standing in for that signal.
 */
export const modalRailGroupClass = `
  flex flex-row gap-[2px] px-3 py-2
  overflow-x-auto overflow-y-hidden scrollbar-hide
  sm:flex-col sm:overflow-visible sm:p-0
`

/** Separates two groups. A rule on the column, a row edge on the strip. */
export const modalRailDividerClass = `
  hidden sm:block h-px w-full bg-[rgba(210,210,210,0.2)] my-1
`
