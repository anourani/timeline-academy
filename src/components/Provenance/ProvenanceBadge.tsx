import { Sparkles } from 'lucide-react'
import type { TimelineOrigin } from '@/types/timeline'

/**
 * Says where a timeline's events came from, and — while it is still locked —
 * offers the one action that changes that.
 *
 * Rendered wherever a user could otherwise mistake generated content for
 * their own, or present it as unedited to someone else: the editor's event
 * table, the event detail panel, and the public viewer.
 *
 * `'manual'` renders nothing at all. The overwhelming majority of timelines
 * are hand-built, and a badge on every one of them says nothing while making
 * the two that matter easier to miss.
 */
export function ProvenanceBadge({
  origin,
  onUnlock,
  className = '',
}: {
  origin: TimelineOrigin
  /** Omitted in read-only surfaces (the public viewer), where there is
   *  nothing for a reader to unlock. */
  onUnlock?: () => void
  className?: string
}) {
  if (origin === 'manual') return null

  const locked = origin === 'ai'

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-white/[0.15] bg-white/[0.06] px-3 py-2 ${className}`}
    >
      <span className="flex items-center gap-1.5 font-['Avenir',sans-serif] text-[13px] leading-[150%] text-[#c9ced4]">
        <Sparkles size={14} strokeWidth={1.25} className="shrink-0 text-[#9b9ea3]" />
        {locked ? 'AI-generated' : 'AI-generated, edited'}
      </span>

      <span className="font-['Avenir',sans-serif] text-[13px] leading-[150%] text-[#9b9ea3]">
        {locked
          ? 'Events are locked so this stays a faithful record of what the model produced.'
          : 'This timeline has been changed by hand since it was generated.'}
      </span>

      {locked && onUnlock && (
        <button
          onClick={onUnlock}
          className="ml-auto shrink-0 rounded-[10px] border border-white/[0.15] bg-white/10 px-[10px] py-[5px] font-['Avenir',sans-serif] text-[13px] font-medium leading-[150%] text-[#c9ced4] transition-colors hover:bg-white/20 hover:text-[#dadee5]"
        >
          Edit anyway
        </button>
      )}
    </div>
  )
}
