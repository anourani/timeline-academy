import { useState, useCallback } from 'react'

/**
 * Whether the open timeline came from an AI generation.
 *
 * Pure local state, like useChapters — loading and saving belong to
 * useTimeline and the draft stores. It is set alongside chapters at every
 * load site, because the two are always replaced together.
 */
export function useAiGenerated(initial = false) {
  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(initial)

  const handleAiGeneratedChange = useCallback((value: boolean) => {
    setIsAiGenerated(value)
  }, [])

  return {
    isAiGenerated,
    handleAiGeneratedChange,
  }
}
