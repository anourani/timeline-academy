import { useNavigate } from 'react-router-dom'
import { GlobalNav } from '@/components/Navigation/GlobalNav'
import { NewTimelineScreen } from '@/components/NewTimeline/NewTimelineScreen'
import { useAIMode } from '@/hooks/useAIMode'

export function AIModePage() {
  const navigate = useNavigate()
  const {
    isGenerating,
    isClassifying,
    classifiedType,
    categoryLabels,
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
      />
    </div>
  )
}
