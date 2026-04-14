import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

type TimelineSelectHandler = (timelineId: string) => void

interface SidePanelContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  onTimelineSelect: TimelineSelectHandler
  setOnTimelineSelect: (handler: TimelineSelectHandler | null) => void
  activeTimelineId: string | null
  setActiveTimelineId: (id: string | null) => void
}

const SidePanelContext = createContext<SidePanelContextValue | null>(null)

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null)
  const navigate = useNavigate()
  const customHandlerRef = useRef<TimelineSelectHandler | null>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  const onTimelineSelect = useCallback<TimelineSelectHandler>((timelineId) => {
    if (customHandlerRef.current) {
      customHandlerRef.current(timelineId)
    } else {
      navigate('/editor', { state: { timelineId } })
    }
  }, [navigate])

  const setOnTimelineSelect = useCallback((handler: TimelineSelectHandler | null) => {
    customHandlerRef.current = handler
  }, [])

  const value = useMemo<SidePanelContextValue>(() => ({
    isOpen,
    open,
    close,
    toggle,
    onTimelineSelect,
    setOnTimelineSelect,
    activeTimelineId,
    setActiveTimelineId,
  }), [isOpen, open, close, toggle, onTimelineSelect, setOnTimelineSelect, activeTimelineId])

  return (
    <SidePanelContext.Provider value={value}>
      {children}
    </SidePanelContext.Provider>
  )
}

export function useSidePanel(): SidePanelContextValue {
  const ctx = useContext(SidePanelContext)
  if (!ctx) {
    throw new Error('useSidePanel must be used within a SidePanelProvider')
  }
  return ctx
}
