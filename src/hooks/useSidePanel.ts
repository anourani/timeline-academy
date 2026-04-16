import { useContext } from 'react'
import { SidePanelContext } from '../contexts/SidePanelContext'

export function useSidePanel() {
  const ctx = useContext(SidePanelContext)
  if (!ctx) {
    throw new Error('useSidePanel must be used within a SidePanelProvider')
  }
  return ctx
}
