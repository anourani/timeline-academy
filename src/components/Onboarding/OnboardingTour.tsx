import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { glassButtonClass, primaryGlassButtonClass } from '@/components/ui/glassButton'
import { PLAN_LIMITS } from '@/constants/plans'
import { TOUR_STEP_COUNT, type TourStep } from '@/contexts/OnboardingContext'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useOnboarding } from '@/hooks/useOnboarding'
import { useSidePanel } from '@/hooks/useSidePanel'
import { cn } from '@/lib/utils'
import { isForeignLayerOpen, useForeignDialogOpen } from './foreignLayers'

interface OnboardingTourProps {
  /** The page's own key or sign-in modal is open: hide the whole layer. */
  suspended: boolean
  /** Opens the Create page's `ApiKeyModal`. */
  onAddKey: () => void
}

interface StepTarget {
  /** Matches a `data-onboarding` attribute on the real UI. */
  anchor: string
  pad: number
  mobilePad: number
  radius: number
  mobileRadius: number
}

const STEPS: Record<TourStep, StepTarget> = {
  0: { anchor: 'composer', pad: 8, mobilePad: 8, radius: 26, mobileRadius: 24 },
  1: { anchor: 'model-pill', pad: 6, mobilePad: 4, radius: 999, mobileRadius: 999 },
  2: { anchor: 'usage', pad: 4, mobilePad: 4, radius: 12, mobileRadius: 12 },
}

/** The side panel's push/slide is 300ms; measure once it has landed. */
const PANEL_SETTLE_MS = 320
const TIP_WIDTH = 360
const VIEWPORT_MARGIN = 12
const MIN_MOBILE_TIP_HEIGHT = 220

/**
 * The target's on-screen box, kept current.
 *
 * Re-queried rather than held: the usage card is a different element in each
 * tier, and the tour is what moves a visitor between them. A `ResizeObserver`
 * catches the card growing when the meters appear; window resizes and the
 * panel's transition (which moves the target without resizing it) are covered
 * by `version` and the settle timer.
 *
 * A target still sitting off-screen — the usage card before the side panel has
 * slid in — is not taken as its position: the previous one is kept, so the
 * spotlight waits where it was and then travels to the card, rather than
 * flying in from off the left edge. `anchor` reports which target `rect`
 * belongs to, so the tip is only placed against its own target.
 */
function useAnchorRect(
  anchor: string,
  paused: boolean,
  version: string,
): { anchor: string | null; rect: DOMRect | null } {
  const [measured, setMeasured] = useState<{ anchor: string | null; rect: DOMRect | null }>({
    anchor: null,
    rect: null,
  })

  useLayoutEffect(() => {
    if (paused) return
    const query = () => document.querySelector<HTMLElement>(`[data-onboarding="${anchor}"]`)
    const measure = () => {
      const rect = query()?.getBoundingClientRect() ?? null
      if (rect && (rect.right <= 0 || rect.left >= window.innerWidth)) return
      setMeasured({ anchor, rect })
    }
    measure()

    const el = query()
    const observer = el ? new ResizeObserver(measure) : null
    if (el) observer?.observe(el)
    window.addEventListener('resize', measure)
    const settle = window.setTimeout(measure, PANEL_SETTLE_MS)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.clearTimeout(settle)
    }
  }, [anchor, paused, version])

  return measured
}

function desktopTipPosition(step: TourStep, rect: DOMRect | null): CSSProperties {
  if (!rect) return { left: Math.max(VIEWPORT_MARGIN, (window.innerWidth - TIP_WIDTH) / 2), bottom: 24 }
  const clampLeft = (x: number) =>
    Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - TIP_WIDTH - VIEWPORT_MARGIN))
  if (step === 0) return { left: clampLeft(rect.left), top: rect.bottom + 22 }
  if (step === 1) return { left: clampLeft(rect.left - 6), top: rect.bottom + 18 }
  return {
    left: clampLeft(rect.right + 22),
    bottom: Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.bottom),
  }
}

/**
 * The first-visit coach marks on `/`: a spotlight over the real UI and a tip
 * card beside it, for a guest with no key (see `AIModePage` for when it
 * starts).
 *
 * The dimmed area swallows clicks rather than closing the tour — a stray click
 * should not end it — while the spotlighted target stays live, so typing in the
 * composer or opening the model menu works mid-tour.
 */
export function OnboardingTour({ suspended, onAddKey }: OnboardingTourProps) {
  const { tourActive, step, next, back, endTour } = useOnboarding()
  const tier = useAccountTier()
  const isMobile = useIsMobile()
  const { isOpen: panelOpen, width: panelWidth } = useSidePanel()
  const foreignDialogOpen = useForeignDialogOpen()

  // While the panel is sliding, hold the spotlight where it was and hide the
  // tip, rather than chase a target that is still moving.
  const [settling, setSettling] = useState(false)
  const prevPanelOpen = useRef(panelOpen)
  useEffect(() => {
    if (prevPanelOpen.current === panelOpen) return
    prevPanelOpen.current = panelOpen
    setSettling(true)
    const t = window.setTimeout(() => setSettling(false), PANEL_SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [panelOpen])

  const hidden = !tourActive || suspended || foreignDialogOpen
  const target = STEPS[step]
  const { anchor: measuredAnchor, rect } = useAnchorRect(
    target.anchor,
    hidden || settling,
    `${tier}|${panelOpen}|${panelWidth}|${isMobile}`,
  )

  // Focus follows the tour: onto its primary button each step, and back to
  // wherever it was when the tour ends.
  const primaryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!tourActive) return
    const previous = document.activeElement as HTMLElement | null
    return () => previous?.focus?.()
  }, [tourActive])
  const tipShown = !hidden && !settling && measuredAnchor === target.anchor
  useEffect(() => {
    if (!tipShown) return
    primaryRef.current?.focus({ preventScroll: true })
  }, [tipShown, step])

  // Esc means Skip — unless it belongs to a menu or dialog on top of us.
  useEffect(() => {
    if (hidden) return
    // The Esc that closes the key modal un-hides the tour while that same
    // event is still propagating, so this listener would see it and skip.
    // Only keypresses that began after the tour reappeared count.
    const since = performance.now()
    const onKey = (e: KeyboardEvent) => {
      if (e.timeStamp < since) return
      if (e.key !== 'Escape' || isForeignLayerOpen()) return
      endTour('skipped')
    }
    // Capture on window runs before Radix's own Esc handling on document, so
    // an open menu is still in the DOM to be seen here.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [hidden, endTour])

  // Leaving `/` mid-tour (a generation from the spotlighted composer, say)
  // ends it. A ref, because the cleanup must see the state at unmount.
  const activeRef = useRef(tourActive)
  activeRef.current = tourActive
  useEffect(() => () => {
    if (activeRef.current) endTour('skipped')
  }, [endTour])

  if (hidden || typeof document === 'undefined') return null

  const pad = isMobile ? target.mobilePad : target.pad
  const radius = isMobile ? target.mobileRadius : target.radius
  const spot = rect && {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  // Four click-catchers around the cut-out. Without a target, one covers all.
  const catchers: CSSProperties[] = spot
    ? [
        { left: 0, top: 0, right: 0, height: Math.max(0, spot.top) },
        { left: 0, top: spot.top + spot.height, right: 0, bottom: 0 },
        { left: 0, top: spot.top, width: Math.max(0, spot.left), height: spot.height },
        { left: spot.left + spot.width, top: spot.top, right: 0, height: spot.height },
      ]
    : [{ inset: 0 }]

  const isTrial = tier === 'trial'
  const byokAnonCap = PLAN_LIMITS['byok-anon'].timelineLimit
  const byokCap = PLAN_LIMITS.byok.timelineLimit
  const copy = stepCopy(step, isTrial, isMobile, byokAnonCap, byokCap)
  const showModelTable = step === 1 && isTrial
  const isLast = step === TOUR_STEP_COUNT - 1
  const titleId = 'onboarding-tip-title'

  // Docked on mobile: to the bottom, except for the usage card at the foot of
  // the drawer. A phone with its browser chrome showing can be too short for
  // the full card beside its target, so the card is capped to the room on its
  // side and its middle scrolls, keeping the buttons in reach and the target
  // in view.
  const dockTop = step === 2
  const mobileRoom = spot
    ? dockTop
      ? spot.top - VIEWPORT_MARGIN * 2
      : window.innerHeight - (spot.top + spot.height) - VIEWPORT_MARGIN * 2
    : window.innerHeight
  const tipPosition: CSSProperties = isMobile
    ? {
        ...(dockTop
          ? { top: 'max(12px, env(safe-area-inset-top))' }
          : { bottom: 'max(12px, env(safe-area-inset-bottom))' }),
        maxHeight: Math.max(MIN_MOBILE_TIP_HEIGHT, mobileRoom),
      }
    : { ...desktopTipPosition(step, rect), width: TIP_WIDTH }

  const counter = isMobile ? (
    <span className="flex items-center gap-1.5" aria-hidden>
      {([0, 1, 2] as const).map((i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-[width] duration-200 motion-reduce:transition-none',
            i === step ? 'w-5 bg-[#DADEE5]' : 'w-1.5 bg-[#404040]',
          )}
        />
      ))}
    </span>
  ) : (
    <span className="font-['JetBrains_Mono',monospace] text-[11px] uppercase text-[#6D7073]" aria-hidden>
      {step + 1} of {TOUR_STEP_COUNT}
    </span>
  )

  const tip = (
    <div
      key={step}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-onboarding-tip=""
      style={tipPosition}
      className={cn(
        'fixed z-[46] flex min-h-0 flex-col gap-[14px] p-5 border border-[#262626] backdrop-blur-[12px]',
        'shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in fade-in-0 duration-200 motion-reduce:animate-none',
        isMobile
          ? 'left-3 right-3 rounded-[20px] bg-[rgba(23,23,23,0.97)]'
          : 'rounded-[16px] bg-[rgba(23,23,23,0.96)]',
      )}
    >
      <div className="flex shrink-0 items-center justify-between">
        {counter}
        <button
          type="button"
          onClick={() => endTour('skipped')}
          className={cn(
            "font-['Avenir',sans-serif] text-[#6D7073] hover:text-[#C9CED4] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded",
            isMobile ? 'text-[13px] h-11 -my-[14px] px-1' : 'text-[12px]',
          )}
        >
          Skip tour
        </button>
      </div>

      <div className="-mx-1 flex min-h-0 flex-col gap-[14px] overflow-y-auto px-1">
        <div className="flex flex-col gap-1.5">
          <h3 id={titleId} className="header-xsmall m-0 text-[#DADEE5]">
            {copy.title}
          </h3>
          <p className="body-m m-0 text-[#9B9EA3]">{copy.body}</p>
        </div>

        {showModelTable && <ModelTable mobile={isMobile} />}
      </div>

      {showModelTable && isMobile && (
        <button
          type="button"
          onClick={onAddKey}
          className={cn(primaryGlassButtonClass, 'h-12 w-full shrink-0 rounded-[12px] py-0 text-[16px] outline-none focus-visible:ring-1 focus-visible:ring-white/40')}
        >
          Add API key
        </button>
      )}

      {isMobile ? (
        <div className="flex shrink-0 gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="flex-1 h-11 rounded-[12px] border border-[#262626] bg-transparent font-['Avenir',sans-serif] font-medium text-[15px] text-[#9B9EA3] hover:text-[#DADEE5] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              Back
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={next}
            className={cn(
              isLast ? primaryGlassButtonClass : glassButtonClass,
              'flex-1 h-11 rounded-[12px] py-0 text-[15px] outline-none focus-visible:ring-1 focus-visible:ring-white/40',
            )}
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          {showModelTable && (
            <button
              type="button"
              onClick={onAddKey}
              className={cn(primaryGlassButtonClass, 'h-[34px] py-0 outline-none focus-visible:ring-1 focus-visible:ring-white/40')}
            >
              Add API key
            </button>
          )}
          <span className="flex-1" />
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="h-[34px] px-2 font-['Avenir',sans-serif] font-medium text-[14px] text-[#9B9EA3] hover:text-[#DADEE5] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded"
            >
              Back
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={next}
            className={cn(
              isLast ? primaryGlassButtonClass : glassButtonClass,
              'h-[34px] min-w-[72px] py-0 outline-none focus-visible:ring-1 focus-visible:ring-white/40',
            )}
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      )}
    </div>
  )

  return createPortal(
    <>
      {catchers.map((style, i) => (
        <div
          key={i}
          className="fixed z-[45]"
          style={style}
          // Swallow the click without moving focus off the tip.
          onMouseDown={(e) => e.preventDefault()}
          aria-hidden
        />
      ))}
      {spot && (
        <div
          aria-hidden
          className="fixed z-[45] pointer-events-none transition-all ease-[var(--ease-enter)] motion-reduce:transition-none"
          style={{
            ...spot,
            transitionDuration: '320ms',
            borderRadius: radius,
            boxShadow: '0 0 0 2px rgba(37,99,235,0.8), 0 0 0 9999px rgba(0,0,0,0.62)',
          }}
        />
      )}
      {/* Only once the spotlight has reached this step's target. */}
      {tipShown && tip}
      {/* Outside the tip, which remounts per step: a live region has to be
          in the page before its text changes to be announced. */}
      <span className="sr-only" aria-live="polite">
        Step {step + 1} of {TOUR_STEP_COUNT}
      </span>
    </>,
    document.body,
  )
}

function stepCopy(
  step: TourStep,
  isTrial: boolean,
  isMobile: boolean,
  byokAnonCap: number | null,
  byokCap: number | null,
): { title: string; body: string } {
  if (step === 0) {
    return {
      title: 'Welcome. Start with a search.',
      body: isMobile
        ? "Type any person, era, or event and we'll draft the whole timeline. Or tap a moment below."
        : "Type any person, era, or event and we'll draft the whole timeline. Not sure? Drop into one of the moments below.",
    }
  }
  if (step === 1) {
    return {
      title: 'This is the AI that builds it',
      body: !isTrial
        ? 'Pick the model that builds your timelines. Every model your key covers is unlocked.'
        : isMobile
          ? 'As a guest, AI is off. Bring your own key to unlock every model, or sign in to use ours.'
          : 'As a guest, AI is off. Bring your own OpenAI or Anthropic key to unlock every model, or sign in to use ours.',
    }
  }
  return {
    title: 'Where your work is kept',
    body: isTrial
      ? `Right now, only in this tab — close it and it's gone. A key keeps up to ${byokAnonCap} timelines in this browser; an account keeps them everywhere.`
      : `Your key is saved. Up to ${byokAnonCap} timelines now stay in this browser. Log in to keep ${byokCap} across devices.`,
  }
}

const MODEL_ROWS = [
  { label: 'Guest', value: 'AI off · nothing saved', highlight: false },
  { label: 'Free account', value: 'Claude Sonnet · daily limit', highlight: false },
  { label: 'Your key', value: 'All OpenAI and Anthropic models · billed to you', highlight: true },
]

function ModelTable({ mobile }: { mobile: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden border border-[#262626] bg-[#0A0A0A] text-[13px] leading-[18px]',
        mobile ? 'rounded-[12px]' : 'rounded-[10px]',
      )}
    >
      {MODEL_ROWS.map((row, i) => (
        <div
          key={row.label}
          className={cn(
            'grid grid-cols-[96px_1fr] gap-2.5 px-3',
            mobile ? 'py-2.5' : 'py-[9px]',
            i > 0 && 'border-t border-[#262626]',
            row.highlight && 'bg-[rgba(37,99,235,0.12)]',
          )}
        >
          <span className={row.highlight ? 'text-[#9B9EA3]' : 'text-[#6D7073]'}>{row.label}</span>
          <span className={row.highlight ? 'text-[#DADEE5]' : i === 0 ? 'text-[#9B9EA3]' : 'text-[#C9CED4]'}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  )
}
