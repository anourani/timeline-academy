import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSidePanel } from '@/hooks/useSidePanel'

export interface ToastMessage {
  /** Changes for every new toast, so the same text twice restarts the timer. */
  id: number
  text: string
}

interface ToastProps {
  toast: ToastMessage | null
  onDismiss: () => void
}

const TOAST_DURATION_MS = 3800

/**
 * A one-line confirmation at the top of the content area that dismisses
 * itself. Deliberately minimal — one toast at a time, no queue, no actions —
 * because so far the only thing that needs it is the onboarding key save.
 *
 * Centred over the content rather than the window: on desktop the side panel
 * pushes the content right, so the toast is pushed by the same amount.
 */
export function Toast({ toast, onDismiss }: ToastProps) {
  const isMobile = useIsMobile()
  const { isOpen, width } = useSidePanel()

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(onDismiss, TOAST_DURATION_MS)
    return () => window.clearTimeout(t)
  }, [toast, onDismiss])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 z-[60] flex justify-center"
      style={{
        top: isMobile ? 72 : 28,
        left: isMobile ? 16 : (isOpen ? width : 0) + 16,
      }}
    >
      {toast && (
        <div
          key={toast.id}
          className="flex items-center gap-2.5 rounded-[12px] border border-[#262626] bg-[rgba(23,23,23,0.92)] px-4 py-2.5 backdrop-blur-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#DADEE5] animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-[#2563EB]" aria-hidden />
          {toast.text}
        </div>
      )}
    </div>,
    document.body,
  )
}
