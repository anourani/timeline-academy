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
 * A sidebar tab in a modal's left rail. Active tabs take the brand fill; the
 * rest stay flat until hovered.
 */
export function modalSidebarTabClass(isActive: boolean): string {
  // An explicit focus ring, because the modal autofocuses its first tab on open
  // and the browser default paints a heavy halo there before the user has done
  // anything. Keyboard users still get a clear indicator, just a quieter one.
  return `
    w-full py-[9px] px-[11px] rounded-[10px] text-left
    font-['Avenir',sans-serif] font-medium text-[14px] leading-[20px] transition-colors
    border border-transparent
    outline-none focus-visible:ring-1 focus-visible:ring-white/40
    ${isActive
      ? 'bg-[rgba(37,99,235,0.4)] text-[#dadee5]'
      : 'bg-transparent text-[#c9ced4] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#dadee5]'
    }
  `
}
