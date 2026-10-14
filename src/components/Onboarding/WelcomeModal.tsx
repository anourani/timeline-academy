import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { PopupShell } from '@/components/ui/PopupShell'
import { primaryGlassButtonClass } from '@/components/ui/glassButton'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useOnboarding } from '@/hooks/useOnboarding'
import { cn } from '@/lib/utils'
import { focusComposer } from './anchors'

const FOCUS_RING = 'outline-none focus-visible:ring-1 focus-visible:ring-white/40'

/**
 * The greeting a first-time guest sees before the tour: what the product does,
 * and a choice — take the tour, or skip it and start searching.
 *
 * Every way of closing it that isn't the primary button counts as Skip (Esc,
 * the overlay, a swipe down), and either outcome is recorded, so it shows once.
 * The Getting started checklist is the way back into the tour afterwards.
 *
 * The tour itself needs no hand-off: it stays hidden while any Radix dialog is
 * open, so step 1 appears only once this has unmounted.
 */
export function WelcomeModal() {
  const { welcomeOpen, acceptWelcome, skipWelcome } = useOnboarding()
  const isMobile = useIsMobile()
  const primaryRef = useRef<HTMLButtonElement>(null)
  // Where focus goes on close depends on which way it closed, and Radix's
  // close-focus hook runs after the state that would say so has been reset.
  const acceptedRef = useRef(false)

  const accept = () => {
    acceptedRef.current = true
    acceptWelcome()
  }

  return (
    <PopupShell
      open={welcomeOpen}
      onOpenChange={(open) => {
        if (!open) skipWelcome()
      }}
      title="Welcome to timeline.academy"
      description="Search any person, era, or event and AI lays it out as a timeline. Open any moment to see what happened, why it mattered, and what came next."
      width={400}
      centered
      hideClose
      initialFocusRef={primaryRef}
      onCloseAutoFocus={(e) => {
        // Never back to the element that had focus before: after Skip the
        // search field is the next thing to use, and after the tour starts
        // the tour moves focus into its own tip.
        e.preventDefault()
        if (!acceptedRef.current) focusComposer()
        acceptedRef.current = false
      }}
      topSlot={
        <span
          className="mb-1.5 size-[9px] rounded-full bg-[#A770EC] shadow-[0_0_14px_#A770EC]"
          aria-hidden
        />
      }
      titleClassName={
        isMobile
          ? 'header-small'
          : 'font-aleo font-normal text-[28px] leading-[125%] tracking-[-0.01em] [text-wrap:balance]'
      }
      className={isMobile ? 'gap-6 pb-[max(24px,env(safe-area-inset-bottom))]' : 'gap-7 pt-8 px-7 pb-5'}
    >
      <div className="flex flex-col gap-1">
        <button
          ref={primaryRef}
          type="button"
          onClick={accept}
          className={cn(
            primaryGlassButtonClass,
            'inline-flex w-full items-center justify-center gap-2 py-0',
            isMobile ? 'h-12 rounded-[12px] text-[16px]' : 'h-[42px] rounded-[10px]',
            FOCUS_RING,
          )}
        >
          Take the 30-second tour
          <ArrowRight size={isMobile ? 16 : 14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={skipWelcome}
          className={cn(
            "w-full rounded-[10px] font-['Avenir',sans-serif] font-medium text-[#9B9EA3] hover:text-[#DADEE5] transition-colors",
            isMobile ? 'h-11 text-[15px]' : 'h-10 text-[14px]',
            FOCUS_RING,
          )}
        >
          Skip
        </button>
      </div>
    </PopupShell>
  )
}
