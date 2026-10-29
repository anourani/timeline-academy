import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Dialog, DialogOverlay, DialogPortal, DialogTrigger } from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'

/** Popover gap above the dock: 17px clear of its edge, plus its 8px padding and 1px border. */
export const DOCK_SIDE_OFFSET = 26

interface DockMenuProps {
  /** Controlled in the dock (from `activePanel`); omit both for uncontrolled. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * The dock button. Must forward its ref — a plain <button>, not the
   * `<Button>` component, which on React 18 doesn't, leaving Radix nothing to
   * anchor the popover to.
   */
  trigger: ReactNode
  /** Names the surface: the popover's small caps header and the drawer's title. */
  title: string
  /** Optional aside in the header (the Legend's event count). */
  headerAside?: ReactNode
  /** Accessible name for the popover and the drawer's close button. */
  label: string
  /** Popover width class, desktop only. */
  widthClass: string
  /**
   * Horizontal alignment against the trigger. The Legend keeps `end`; the
   * Design menu centres over its button. Collision padding still pushes the
   * surface inward when it would cross the viewport edge.
   */
  align?: 'start' | 'center' | 'end'
  /** `top` rises from the dock; `bottom` drops from the nav (the nav Legend). */
  side?: 'top' | 'bottom'
  sideOffset?: number
  onOpenAutoFocus?: (e: Event) => void
  children: ReactNode
}

/**
 * The shell every dock menu wears: an anchored popover rising from the dock on
 * desktop, a full-screen drawer rising from the bottom edge on a phone.
 *
 * Shared so the Legend and the Design menu can't drift apart. The split has to
 * happen in JavaScript: a Popover cannot become the drawer — its position
 * lives as inline styles on Radix's own popper wrapper, which no `className`
 * here can reach. See `useIsMobile`.
 *
 * Crossing the breakpoint while open unmounts one root and mounts the other
 * closed, so the menu simply closes. Radix releases the Dialog's scroll lock
 * on unmount, so nothing is stranded.
 */
export function DockMenu({
  open,
  onOpenChange,
  trigger,
  title,
  headerAside,
  label,
  widthClass,
  align = 'end',
  side = 'top',
  sideOffset = DOCK_SIDE_OFFSET,
  onOpenAutoFocus,
  children,
}: DockMenuProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogPortal>
          {/* Covered by the content once open, but it carries the fade and is
              the click target while the drawer is still on its way up. */}
          <DialogOverlay className="bg-black/50" />
          <DialogPrimitive.Content
            // Silences Radix's missing-description warning: the Title names
            // the dialog and there is nothing to add below it.
            aria-describedby={undefined}
            onOpenAutoFocus={onOpenAutoFocus}
            // Inline for the same reason as the popover's — see below.
            style={{ animationDuration: '300ms' }}
            className={cn(
              'fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#171717] outline-none',
              // `slide-*-bottom` is translateY(100%) ↔ 0, and on an `inset-0`
              // box that is a full viewport height: the drawer rises from the
              // bottom edge and leaves the same way.
              'data-[state=open]:animate-in data-[state=closed]:animate-out ease-out',
              'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
              // The `data-[state=…]` variants compile to a class *plus* an
              // attribute selector, so a bare `motion-reduce:animate-none` —
              // one class — loses to them on specificity and the slide plays
              // regardless. A media query adds no specificity of its own, so
              // the reduce guard has to carry the same attribute to win.
              'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
            )}
          >
            <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2 border-b border-[#404040] shrink-0">
              <DialogPrimitive.Title className="header-xsmall text-[#c9ced4] m-0">
                {title}
              </DialogPrimitive.Title>
              <div className="flex items-center gap-3">
                {headerAside}
                {/* A `fixed inset-0` drawer has no outside to tap and a phone
                    has no Escape key, so the X is the only way back out. */}
                <DialogPrimitive.Close
                  aria-label={`Close ${label.toLowerCase()}`}
                  className="relative flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                >
                  <X size={16} strokeWidth={1.25} />
                </DialogPrimitive.Close>
              </div>
            </div>
            {/* Escape, focus trap, return-focus-to-trigger and the body scroll
                lock all come from Dialog. Nothing here re-implements them. */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2">{children}</div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>

      <PopoverContent
        unstyled
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        aria-label={label}
        onOpenAutoFocus={onOpenAutoFocus}
        // Inline, because an arbitrary duration utility is ambiguous to
        // Tailwind here — the core transition scale and tailwindcss-animate's
        // animation scale share the `duration-` namespace and both take a
        // <time>, so no type hint can separate them. The
        // `motion-reduce:animate-none` class still wins: it zeroes
        // `animation-name`, which this does not touch.
        style={{ animationDuration: '120ms' }}
        className={cn(
          'z-50 outline-none',
          widthClass,
          'rounded-[16px] border border-[#262626] p-2 backdrop-blur-[12px]',
          'bg-[rgba(23,23,23,0.92)]',
          'shadow-[0px_8px_32px_rgba(0,0,0,0.4)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
          // Same specificity story as the drawer's guard above.
          'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
        )}
      >
        <div className="flex items-center justify-between px-[10px] pb-[8px] pt-[6px]">
          <span className="label-s-type2 uppercase tracking-[0.04em] text-[#9B9EA3]">
            {title}
          </span>
          {headerAside}
        </div>

        {children}
      </PopoverContent>
    </Popover>
  )
}
