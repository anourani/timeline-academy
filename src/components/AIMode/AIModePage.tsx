import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlobalNav } from '@/components/Navigation/GlobalNav'
import { NewTimelineScreen } from '@/components/NewTimeline/NewTimelineScreen'
import { ImportCSVModal } from '@/components/AIMode/ImportCSVModal'
import { useAIMode } from '@/hooks/useAIMode'
import { useAuth } from '@/hooks/useAuth'
import type { TimelineEvent } from '@/types/event'

export function AIModePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isImportOpen, setIsImportOpen] = useState(false)
  const {
    isGenerating,
    isClassifying,
    classifiedType,
    error,
    classifyAndGenerate,
    abort,
  } = useAIMode()

  const handleAIGenerate = async (subject: string) => {
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

  const handleCancel = () => {
    abort()
  }

  const handleStartFresh = () => {
    if (user) {
      navigate('/editor', { state: { timelineId: 'new', skipCreationScreen: true } })
    } else {
      navigate('/editor', { state: { newTimeline: true, skipCreationScreen: true } })
    }
  }

  const handleImportEvents = (events: TimelineEvent[]) => {
    setIsImportOpen(false)
    navigate('/editor', { state: { importedEvents: events } })
  }

  return (
    <div className="relative min-h-screen bg-surface-primary">
      <div className="absolute top-0 left-0 right-0 z-20">
        <GlobalNav />
      </div>
      <NewTimelineScreen
        onAIGenerate={handleAIGenerate}
        onCancel={handleCancel}
        onStartFresh={handleStartFresh}
        onImportCSV={() => setIsImportOpen(true)}
        isGenerating={isGenerating}
        isClassifying={isClassifying}
        classifiedType={classifiedType}
        error={error}
      />
      <ImportCSVModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportEvents={handleImportEvents}
      />
    </div>
  )
}
