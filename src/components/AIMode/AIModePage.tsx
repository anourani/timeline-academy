import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlobalNav } from '@/components/Navigation/GlobalNav'
import { NewTimelineScreen } from '@/components/NewTimeline/NewTimelineScreen'
import { AuthModal } from '@/components/Auth/AuthModal'
import { ApiKeyModal } from '@/components/Modal/ApiKeyModal'
import { useAIMode } from '@/hooks/useAIMode'
import { useAuth } from '@/hooks/useAuth'
import { hasAnyKey } from '@/services/userApiKey'
import type { ByokProvider } from '@/types/ai'

export function AIModePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    isGenerating,
    isClassifying,
    classifiedType,
    categoryLabels,
    error,
    retryProvider,
    classifyAndGenerate,
    abort,
  } = useAIMode()

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

  const runGeneration = async (
    subject: string,
    providerOverride?: ByokProvider,
  ) => {
    lastSubjectRef.current = subject
    try {
      const { title, description, events, categories } =
        await classifyAndGenerate(subject, providerOverride)
      navigate('/editor', {
        state: {
          aiGenerated: { title, description, events, categories },
        },
      })
    } catch {
      // Error is surfaced via the `error` state in useAIMode and rendered below.
    }
  }

  const handleAIGenerate = async (subject: string) => {
    if (!user && !hasAnyKey()) {
      pendingSubjectRef.current = subject
      setShowApiKeyModal(true)
      return
    }
    await runGeneration(subject)
  }

  // Resume a pending generation after the user signs in through the gate.
  useEffect(() => {
    if (user && pendingSubjectRef.current) {
      const subject = pendingSubjectRef.current
      pendingSubjectRef.current = null
      setShowAuthModal(false)
      void runGeneration(subject)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleKeySaved = () => {
    setShowApiKeyModal(false)
    const subject = pendingSubjectRef.current
    pendingSubjectRef.current = null
    if (subject) void runGeneration(subject)
  }

  const handleCancel = () => {
    abort()
  }

  return (
    <div className="relative min-h-screen bg-surface-primary">
      <div className="absolute top-0 left-0 right-0 z-20">
        <GlobalNav />
      </div>
      <NewTimelineScreen
        onAIGenerate={handleAIGenerate}
        onCancel={handleCancel}
        isGenerating={isGenerating}
        isClassifying={isClassifying}
        classifiedType={classifiedType}
        categoryLabels={categoryLabels}
        error={error}
        retryProvider={retryProvider}
        onRetryWithProvider={(provider) => {
          const subject = lastSubjectRef.current
          if (subject) void runGeneration(subject, provider)
        }}
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
