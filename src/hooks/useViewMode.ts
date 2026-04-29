import { useState, useCallback } from 'react'

export type ViewMode = 'edit' | 'present'

export function useViewMode(initialMode: ViewMode = 'edit') {
  const [mode, setMode] = useState<ViewMode>(initialMode)
  const handleModeChange = useCallback((newMode: ViewMode) => {
    setMode(newMode)
  }, [])
  return { mode, setMode: handleModeChange }
}
