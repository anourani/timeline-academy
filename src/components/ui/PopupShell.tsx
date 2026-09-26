import { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'

interface PopupShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  /** Rendered in the top row, left of the close button. */
  topSlot?: React.ReactNode
  /** Desktop card width in px. */
  width?: number
  /**
   * Mobile only: a sheet at least 70% of the viewport tall, so a `flex-1`
   * spacer among the children can pin the primary action to the bottom edge.
   * Without it the sheet is as tall as its content.
   */
  tall?: boolean
  /** `role="alertdialog"` — for confirming something irreversible. */
  alert?: boolean
  /** Receives focus on open instead of Radix's first-focusable default. */
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

/** Drag distance past which releasing the grabber dismisses the sheet. */
const SWIPE_DISMISS_PX = 80

/**
 * The shared frame for short popups: a floating card at `md` and above, a
 * bottom sheet below it. Same split, surfaces and motion as `CategoryLegend`.
 *
 * Both sides are one Radix Dialog, so Escape, the focus trap, the scroll lock
 * and return-focus come for free. Only the Content differs, which is why this
 * branches on `useIsMobile` rather than on classes: the sheet has a grabber
 * and a swipe, the card has a visible close button.
 *
 * Children are laid out directly in the Content's flex column, after the title
 * block, so they share its gap and a `flex-1` child can act as a spacer.
 */
export function PopupShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  topSlot,
  width = 420,
  tall = false,
  alert = false,
  initialFocusRef,
}: PopupShellProps) {
  const isMobile = useIsMobile()
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef(0)

  // A sheet dismissed by swipe leaves on its exit animation from wherever it
  // was dropped, so the offset is only cleared for the next opening.
  useEffect(() => {
    if (open) setDragY(0)
  }, [open])

  const handleOpenAutoFocus = (e: Event) => {
    if (!initialFocusRef?.current) return
    e.preventDefault()
    initialFocusRef.current.focus()
  }

  const titleBlock = (
    <div className="flex flex-col gap-1.5">
      <DialogPrimitive.Title className="header-small text-[#DADEE5] m-0">{title}</DialogPrimitive.Title>
      {description && (
        <DialogPrimitive.Description className="body-m text-[#9B9EA3] m-0">
          {description}
        </DialogPrimitive.Description>
      )}
    </div>
  )

  // `role` passes through Radix's Content props and overrides its "dialog".
  const role = alert ? 'alertdialog' : undefined
  // Silences Radix's missing-description warning when there is none.
  const describedBy = description ? {} : { 'aria-describedby': undefined }

  // Crossing the breakpoint while open swaps one Content for the other, so the
  // popup stays open but restarts its entrance. Same as the legend.
  if (isMobile) {
    const onGrabberDown = (e: React.PointerEvent<HTMLDivElement>) => {
      dragStartRef.current = e.clientY
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    const onGrabberMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      setDragY(Math.max(0, e.clientY - dragStartRef.current))
    }
    const onGrabberUp = () => {
      if (!dragging) return
      setDragging(false)
      if (dragY > SWIPE_DISMISS_PX) onOpenChange(false)
      else setDragY(0)
    }

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay className="bg-black/50" />
          <DialogPrimitive.Content
            role={role}
            {...describedBy}
            onOpenAutoFocus={handleOpenAutoFocus}
            style={{
              animationDuration: '300ms',
              transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
              transition: dragging ? undefined : 'transform 200ms ease-out',
            }}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 flex flex-col gap-[18px] outline-none',
              'max-h-[calc(100dvh-24px)] overflow-y-auto',
              'rounded-t-[24px] border-t border-[#262626] bg-[#171717]',
              'px-5 pt-2.5 pb-[max(28px,env(safe-area-inset-bottom))]',
              'shadow-[0_-8px_32px_rgba(0,0,0,0.4)]',
              tall && 'min-h-[70dvh]',
              'data-[state=open]:animate-in data-[state=closed]:animate-out ease-out',
              'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
              // See CategoryLegend: the guard has to carry the same attribute
              // selector as the animation it cancels, or it loses on specificity.
              'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
            )}
          >
            {/* The grabber's row is the swipe target — padded out so a thumb
                can find it, `touch-none` so the drag isn't taken as a scroll. */}
            <div
              className="-mx-5 -mt-2.5 -mb-2 flex shrink-0 touch-none justify-center pt-2.5 pb-2 cursor-grab"
              onPointerDown={onGrabberDown}
              onPointerMove={onGrabberMove}
              onPointerUp={onGrabberUp}
              onPointerCancel={onGrabberUp}
              aria-hidden
            >
              <div className="h-1 w-9 rounded-full bg-[#404040]" />
            </div>
            {/* No visible X on a sheet — the overlay and the swipe dismiss it —
                but a screen reader still needs a way out. */}
            <DialogPrimitive.Close className="sr-only">Close</DialogPrimitive.Close>
            {topSlot && <div className="flex items-center">{topSlot}</div>}
            {titleBlock}
            {children}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/50" />
        <DialogPrimitive.Content
          role={role}
          {...describedBy}
          onOpenAutoFocus={handleOpenAutoFocus}
          // Inline for the same reason as the legend's popover: the arbitrary
          // duration utility is ambiguous to Tailwind.
          style={{ animationDuration: '120ms', width }}
          className={cn(
            // Centred with `inset-0 m-auto h-fit` rather than a -50% translate:
            // the enter/exit keyframes animate `transform`, and would drop the
            // translate for the length of the animation.
            'fixed inset-0 z-50 m-auto h-fit max-h-[90vh] max-w-[90vw] overflow-y-auto',
            'flex flex-col gap-5 p-6 outline-none',
            'rounded-[16px] border border-[#262626] bg-[rgba(23,23,23,0.92)] backdrop-blur-[12px]',
            'shadow-[0px_8px_32px_rgba(0,0,0,0.4)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-[0.98] data-[state=closed]:zoom-out-[0.98]',
            'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center">{topSlot}</div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-1 shrink-0 rounded p-1 text-[#6D7073] transition-colors hover:text-[#C9CED4] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              <X size={16} strokeWidth={1.25} />
            </DialogPrimitive.Close>
          </div>
          {titleBlock}
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
