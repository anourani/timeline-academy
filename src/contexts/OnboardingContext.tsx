import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useGeneration } from '@/hooks/useGeneration'
import { useSidePanel } from '@/hooks/useSidePanel'

/**
 * First-visit onboarding: the three-step spotlight tour on `/` and the
 * "Getting started" checklist that outlives it.
 *
 * Mounted beside `GenerationProvider` rather than inside `AIModePage`, because
 * one checklist item — "Make your first timeline" — is earned on the editor
 * route, where the Create page is unmounted. The tour itself only ever renders
 * on `/`.
 *
 * Bump the storage key versions to show the tour again after a meaningful
 * change to it.
 */
const TOUR_KEY = 'onboarding_tour_v1'
const CHECKLIST_KEY = 'onboarding_checklist_v1'

export type TourStep = 0 | 1 | 2
export const TOUR_STEP_COUNT = 3
export type TourOutcome = 'done' | 'skipped'

export interface ChecklistState {
  tour: boolean
  ai: boolean
  first: boolean
}

interface StoredChecklist extends ChecklistState {
  hidden: boolean
}

const EMPTY_CHECKLIST: StoredChecklist = { tour: false, ai: false, first: false, hidden: false }

interface OnboardingContextValue {
  tourActive: boolean
  step: TourStep
  /** The tour has run to an end on this browser at least once. */
  tourSeen: boolean
  startTour: () => void
  next: () => void
  back: () => void
  goToStep: (step: TourStep) => void
  endTour: (outcome: TourOutcome) => void
  checklist: ChecklistState
  checklistVisible: boolean
  hideChecklist: () => void
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(null)

function readTourStatus(): TourOutcome | null {
  try {
    const raw = localStorage.getItem(TOUR_KEY)
    return raw === 'done' || raw === 'skipped' ? raw : null
  } catch {
    return null
  }
}

function readChecklist(): StoredChecklist {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY)
    if (!raw) return EMPTY_CHECKLIST
    const parsed = JSON.parse(raw) as Partial<StoredChecklist>
    return {
      tour: parsed.tour === true,
      ai: parsed.ai === true,
      first: parsed.first === true,
      hidden: parsed.hidden === true,
    }
  } catch {
    return EMPTY_CHECKLIST
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const tier = useAccountTier()
  const generation = useGeneration()
  const { isOpen: panelOpen, open: openPanel, close: closePanel, activeEventCount } = useSidePanel()

  const [tourStatus, setTourStatus] = useState(readTourStatus)
  const [stored, setStored] = useState(readChecklist)
  const [tourActive, setTourActive] = useState(false)
  const [step, setStep] = useState<TourStep>(0)

  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(stored))
    } catch {
      // storage full or disabled — the checklist just won't survive a reload
    }
  }, [stored])

  const tick = useCallback((item: keyof ChecklistState) => {
    setStored((prev) => (prev[item] ? prev : { ...prev, [item]: true }))
  }, [])

  // Each item is derived from state that already exists, and then persisted —
  // so "Choose how AI runs" stays ticked if the key is later removed, and
  // "Make your first timeline" stays ticked once the editor is left.
  useEffect(() => {
    if (tier !== 'loading' && tier !== 'trial') tick('ai')
  }, [tier, tick])

  // Any status but `idle` means a generation was started at least once.
  useEffect(() => {
    if (generation.status !== 'idle') tick('first')
  }, [generation.status, tick])

  // The editor publishes its live event count to the panel; a manual timeline
  // getting its first event lands here without the editor knowing about us.
  useEffect(() => {
    if ((activeEventCount ?? 0) > 0) tick('first')
  }, [activeEventCount, tick])

  // Step 3 points at the usage card, which lives in the side panel. Open it if
  // the visitor had it collapsed, and put it back the moment the tour leaves
  // that step — only if it was the tour that opened it, so a visitor's own
  // choice is never overwritten.
  const panelOpenRef = useRef(panelOpen)
  panelOpenRef.current = panelOpen
  const openedPanelRef = useRef(false)
  useEffect(() => {
    if (tourActive && step === 2) {
      if (!panelOpenRef.current) {
        openedPanelRef.current = true
        openPanel()
      }
      return
    }
    if (openedPanelRef.current) {
      openedPanelRef.current = false
      closePanel()
    }
  }, [tourActive, step, openPanel, closePanel])

  const startTour = useCallback(() => {
    setStep(0)
    setTourActive(true)
  }, [])

  const endTour = useCallback((outcome: TourOutcome) => {
    setTourActive(false)
    setTourStatus(outcome)
    try {
      localStorage.setItem(TOUR_KEY, outcome)
    } catch {
      // storage disabled — the tour will offer itself again next visit
    }
    tick('tour')
  }, [tick])

  const next = useCallback(() => {
    if (step >= TOUR_STEP_COUNT - 1) endTour('done')
    else setStep((step + 1) as TourStep)
  }, [step, endTour])

  const back = useCallback(() => {
    setStep((prev) => (prev > 0 ? ((prev - 1) as TourStep) : prev))
  }, [])

  const hideChecklist = useCallback(() => {
    setStored((prev) => ({ ...prev, hidden: true }))
  }, [])

  const tourSeen = tourStatus !== null
  const allDone = stored.tour && stored.ai && stored.first
  const checklistVisible = (tourSeen || tourActive) && !stored.hidden && !allDone

  const checklist = useMemo<ChecklistState>(
    () => ({ tour: stored.tour, ai: stored.ai, first: stored.first }),
    [stored.tour, stored.ai, stored.first],
  )

  const value = useMemo<OnboardingContextValue>(() => ({
    tourActive,
    step,
    tourSeen,
    startTour,
    next,
    back,
    goToStep: setStep,
    endTour,
    checklist,
    checklistVisible,
    hideChecklist,
  }), [tourActive, step, tourSeen, startTour, next, back, endTour, checklist, checklistVisible, hideChecklist])

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  )
}
