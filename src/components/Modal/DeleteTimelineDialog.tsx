import { useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Trash2 } from 'lucide-react'
import { PopupShell } from '@/components/ui/PopupShell'
import { glassButtonClass, solidDestructiveButtonClass } from '@/components/ui/glassButton'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import type { CategorySlice } from '@/utils/categoryCounts'

interface DeleteTimelineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  title: string
  eventCount: number
  /** Dominant category colour — the side-panel badge's colour. */
  color: string
  /** Events per category. Empty while unknown, which hides the strip. */
  breakdown: CategorySlice[]
  dateRange?: string
}

/**
 * Confirms deleting a timeline by showing the thing itself: a copy of its
 * side-panel tile, with the category strip and a one-line summary, so the user
 * can see exactly what is about to go.
 *
 * An alert dialog in role only. Clicking outside or pressing Escape closes it
 * — neither ever confirms — and focus opens on "Keep it", so an Enter pressed
 * out of habit is the safe answer.
 */
export function DeleteTimelineDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  eventCount,
  color,
  breakdown,
  dateRange,
}: DeleteTimelineDialogProps) {
  const isMobile = useIsMobile()
  const keepRef = useRef<HTMLButtonElement>(null)

  const meta = [
    `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`,
    breakdown.length > 0 && `${breakdown.length} ${breakdown.length === 1 ? 'category' : 'categories'}`,
    dateRange,
  ].filter(Boolean).join(' · ')

  const keep = (
    <DialogPrimitive.Close
      ref={keepRef}
      className={cn(
        glassButtonClass,
        'flex-1 outline-none focus-visible:ring-1 focus-visible:ring-white/40',
        isMobile ? 'w-full h-[52px] rounded-[12px] text-[16px]' : 'h-[38px] py-0',
      )}
    >
      Keep it
    </DialogPrimitive.Close>
  )

  const remove = (
    <button
      type="button"
      onClick={() => {
        onConfirm()
        onOpenChange(false)
      }}
      className={cn(
        solidDestructiveButtonClass,
        'flex-1 outline-none focus-visible:ring-1 focus-visible:ring-white/40',
        isMobile ? 'w-full h-[52px] rounded-[12px] text-[16px]' : 'h-[38px] py-0',
      )}
    >
      <Trash2 size={14} strokeWidth={1.5} />
      Delete Timeline
    </button>
  )

  return (
    <PopupShell
      open={open}
      onOpenChange={onOpenChange}
      alert
      initialFocusRef={keepRef}
      title="Delete this timeline?"
      description="This action cannot be undone."
    >
      <div className="flex flex-col gap-2.5 rounded-[10px] border border-[#262626] bg-[#0A0A0A] px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="label-s-type1 w-4 shrink-0" style={{ color }}>
            {eventCount}
          </span>
          <span className="body-m min-w-0 flex-1 truncate text-[#DADEE5]">{title}</span>
        </div>
        {breakdown.length > 0 && (
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded" aria-hidden>
            {breakdown.map((slice, i) => (
              <div key={i} style={{ flexGrow: slice.count, backgroundColor: slice.color }} />
            ))}
          </div>
        )}
        <span className="font-['JetBrains_Mono',monospace] text-[11px] uppercase text-[#6D7073]">
          {meta}
        </span>
      </div>

      {/* Stacked on a phone with the destructive action on top, full width
          for the thumb. "Keep it" still takes focus either way. */}
      {isMobile ? (
        <div className="flex flex-col gap-2">
          {remove}
          {keep}
        </div>
      ) : (
        <div className="flex gap-2">
          {keep}
          {remove}
        </div>
      )}
    </PopupShell>
  )
}
