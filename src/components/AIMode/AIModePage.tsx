import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlobalNav } from '@/components/Navigation/GlobalNav'
import { NewTimelineScreen } from '@/components/NewTimeline/NewTimelineScreen'
import { AuthModal } from '@/components/Auth/AuthModal'
import { ApiKeyModal } from '@/components/Modal/ApiKeyModal'
import { OnboardingTour } from '@/components/Onboarding/OnboardingTour'
import { GettingStartedChecklist } from '@/components/Onboarding/GettingStartedChecklist'
import { WelcomeModal } from '@/components/Onboarding/WelcomeModal'
import { isForeignDialogOpen } from '@/components/Onboarding/foreignLayers'
import { Toast, type ToastMessage } from '@/components/ui/Toast'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useOnboarding } from '@/hooks/useOnboarding'
import { useSidePanel } from '@/hooks/useSidePanel'
import { useGeneration } from '@/hooks/useGeneration'
import { useAuth } from '@/hooks/useAuth'
import { awaitByokSync, getKey, hasAnyKey } from '@/services/userApiKey'
import type { ByokProvider } from '@/types/ai'

export function AIModePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const generation = useGeneration()
  const tier = useAccountTier()
  const isMobile = useIsMobile()
  const { isOpen: panelOpen } = useSidePanel()
  const onboarding = useOnboarding()

  // Server-funded generation requires sign-in; anonymous visitors can instead
  // add their own OpenAI or Anthropic key. When a signed-out, keyless visitor
  // hits Generate we stash the subject, open the gate, and resume once either
  // path completes.
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const pendingSubjectRef = useRef<string | null>(null)
  // The last subject actually attempted, so a retry against the other
  // provider knows what to re-run. `pendingSubjectRef` can't serve here — it
  // is cleared as soon as the gate resolves.
  const lastSubjectRef = useRef<string | null>(null)
  const lastRectRef = useRef<DOMRect | null>(null)
  // Whether the key modal was opened by onboarding (the tour's button or the
  // checklist), which is what earns a confirmation toast on save.
  const keyFromOnboardingRef = useRef(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])

  // First visit as a keyless guest: greet them and offer a walk through the
  // page before they find the key gate by pressing Generate. Waits for the
  // tier to resolve and the page to settle, and never starts over an error or
  // another modal. The welcome modal decides whether the tour itself runs.
  const shouldStartTour =
    tier === 'trial' &&
    !onboarding.tourSeen &&
    !onboarding.tourActive &&
    !onboarding.welcomeOpen &&
    generation.status !== 'error' &&
    !showApiKeyModal &&
    !showAuthModal &&
    // The mobile drawer covers the whole page, composer included.
    !(isMobile && panelOpen)
  const { openWelcome } = onboarding
  useEffect(() => {
    if (!shouldStartTour) return
    const t = window.setTimeout(() => {
      if (isForeignDialogOpen()) return
      if (!document.querySelector('[data-onboarding="composer"]')) return
      openWelcome()
    }, 400)
    return () => window.clearTimeout(t)
  }, [shouldStartTour, openWelcome])

  const openKeyFromOnboarding = () => {
    keyFromOnboardingRef.current = true
    setShowApiKeyModal(true)
  }

  /**
   * Leave for the editor, which starts the generation.
   *
   * Nothing is awaited and nothing is started here. The editor owns both the
   * capacity decision and the call to `generation.start()`, because the one
   * limit that can still refuse — the trial's single slot — is resolved by a
   * modal that needs the occupying timeline in front of it. Keeping the start
   * on that side means there is one place where "may this run" and "run it"
   * are decided together.
   */
  const go = (
    subject: string,
    fromRect: DOMRect | null,
    providerOverride?: ByokProvider,
  ) => {
    lastSubjectRef.current = subject
    lastRectRef.current = fromRect

    navigate('/editor', {
      state: {
        aiStreaming: {
          subject,
          providerOverride,
          // A plain object, not the DOMRect: React Router serialises route
          // state into history, and a DOMRect does not survive the trip.
          fromRect: fromRect
            ? {
                top: fromRect.top,
                left: fromRect.left,
                width: fromRect.width,
                height: fromRect.height,
              }
            : null,
        },
      },
    })
  }

  const handleAIGenerate = async (subject: string, fromRect: DOMRect | null) => {
    // On a fresh device the account's key is still being pulled into the
    // local cache when the page finishes loading. Without this wait, a
    // Generate clicked inside that window reads no key and quietly takes the
    // server-funded path — spending our budget, on Sonnet, for a user who
    // brought Opus. Resolves immediately once the sync has landed.
    if (user) await awaitByokSync()

    if (!user && !hasAnyKey()) {
      pendingSubjectRef.current = subject
      lastRectRef.current = fromRect
      setShowApiKeyModal(true)
      return
    }
    go(subject, fromRect)
  }

  // Resume a pending generation after the user signs in through the gate.
  useEffect(() => {
    // Signing in settles "how AI runs", which is what the tour was for.
    if (user && (onboarding.tourActive || onboarding.welcomeOpen)) onboarding.endTour('done')
    if (user && pendingSubjectRef.current) {
      const subject = pendingSubjectRef.current
      pendingSubjectRef.current = null
      setShowAuthModal(false)
      go(subject, lastRectRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleKeySaved = () => {
    setShowApiKeyModal(false)
    const fromOnboarding = keyFromOnboardingRef.current
    keyFromOnboardingRef.current = false
    // A key saved mid-tour — from the tip or from the model menu's own unlock
    // row — moves on to where that key now keeps the visitor's work.
    if (onboarding.tourActive) onboarding.goToStep(2)
    // On mobile, step 3's card docks where the toast would sit and already
    // opens with "Your key is saved", so the toast would only cover it.
    const tipCoversToast = isMobile && onboarding.tourActive
    if ((fromOnboarding || onboarding.tourActive) && !tipCoversToast) {
      const anthropic = Boolean(getKey('anthropic'))
      const openai = Boolean(getKey('openai'))
      const which = anthropic && openai ? 'Both keys' : anthropic ? 'Anthropic key' : 'OpenAI key'
      setToast({ id: Date.now(), text: `${which} saved in this browser · all models unlocked` })
    }
    const subject = pendingSubjectRef.current
    pendingSubjectRef.current = null
    if (subject) go(subject, lastRectRef.current)
  }

  return (
    <div className="relative h-screen overflow-hidden bg-surface-primary">
      <div className="absolute top-0 left-0 right-0 z-20">
        <GlobalNav />
      </div>
      <NewTimelineScreen
        onAIGenerate={handleAIGenerate}
        // A run that ended with nothing to show — cancelled, or failed — is
        // what sends the user back here, so the field comes back holding what
        // they asked for rather than empty. Only those: after a timeline was
        // made, the search page is for starting the next one, and a field
        // pre-filled with the last subject would be in the way.
        initialSubject={
          (generation.status === 'cancelled' || generation.status === 'error') &&
          generation.events.length === 0
            ? generation.subject
            : ''
        }
        // A generation that failed before producing anything sends the user
        // back here, so the error it left on the store is this page's to
        // show — the same row, and the same retry affordance, as before.
        error={generation.status === 'error' ? generation.error : null}
        retryProvider={generation.retryProvider}
        onRetryWithProvider={(provider) => {
          const subject = lastSubjectRef.current
          if (subject) go(subject, lastRectRef.current, provider)
        }}
        // The dropdown's unlock row opens the same gate the Generate button
        // does. No subject is stashed, so handleKeySaved simply closes it —
        // adding a key from the dropdown should not start a generation the
        // user never asked for.
        onRequestApiKey={() => setShowApiKeyModal(true)}
      />
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => {
          setShowApiKeyModal(false)
          pendingSubjectRef.current = null
          keyFromOnboardingRef.current = false
        }}
        onKeySaved={handleKeySaved}
        onRequestSignIn={() => {
          setShowApiKeyModal(false)
          setShowAuthModal(true)
        }}
      />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
      <OnboardingTour
        suspended={showApiKeyModal || showAuthModal}
        onAddKey={openKeyFromOnboarding}
      />
      <WelcomeModal />
      <GettingStartedChecklist onAddKey={openKeyFromOnboarding} />
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
