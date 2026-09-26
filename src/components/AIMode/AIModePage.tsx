import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlobalNav } from '@/components/Navigation/GlobalNav'
import { NewTimelineScreen } from '@/components/NewTimeline/NewTimelineScreen'
import { AuthModal } from '@/components/Auth/AuthModal'
import { ApiKeyModal } from '@/components/Modal/ApiKeyModal'
import { useGeneration } from '@/hooks/useGeneration'
import { useAuth } from '@/hooks/useAuth'
import { awaitByokSync, hasAnyKey } from '@/services/userApiKey'
import type { ByokProvider } from '@/types/ai'

export function AIModePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const generation = useGeneration()

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
    </div>
  )
}
