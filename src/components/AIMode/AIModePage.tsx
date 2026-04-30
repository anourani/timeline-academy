import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlobalNav } from '@/components/Navigation/GlobalNav'
import { NewTimelineScreen } from '@/components/NewTimeline/NewTimelineScreen'
import { useAIMode } from '@/hooks/useAIMode'
import { useAuth } from '@/hooks/useAuth'
import { useAnthropicKey } from '@/services/userApiKey'
import { AuthModal } from '@/components/Auth/AuthModal'
import { ApiKeyModal } from '@/components/Modal/ApiKeyModal'

export function AIModePage() {
  const navigate = useNavigate()
  const {
    isGenerating,
    isClassifying,
    classifiedType,
    error,
    classifyAndGenerate,
    abort,
  } = useAIMode()
  const { user } = useAuth()
  const apiKey = useAnthropicKey()
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  // Subject the user was trying to generate when they hit the setup gate.
  // Resumed automatically once they save a key or sign in.
  const pendingSubjectRef = useRef<string | null>(null)

  const runGenerate = async (subject: string) => {
    try {
      const { title, description, events, categories } = await classifyAndGenerate(subject)
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
    // BYOK or signed-in user → run directly. Otherwise prompt.
    if (apiKey || user) {
      await runGenerate(subject)
      return
    }
    pendingSubjectRef.current = subject
    setShowApiKeyModal(true)
  }

  // Resume the pending generation once the user has signed in (the AuthModal
  // path closes the modal before auth state propagates, so `onClose` may run
  // with a stale `user`).
  useEffect(() => {
    if (user && pendingSubjectRef.current) {
      const subject = pendingSubjectRef.current
      pendingSubjectRef.current = null
      runGenerate(subject)
    }
    // runGenerate is stable enough — its only deps are setters / hook returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

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
        error={error}
      />
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onKeySaved={() => {
          setShowApiKeyModal(false)
          if (pendingSubjectRef.current) {
            const subject = pendingSubjectRef.current
            pendingSubjectRef.current = null
            runGenerate(subject)
          }
        }}
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
