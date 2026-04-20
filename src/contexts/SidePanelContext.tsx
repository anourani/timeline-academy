import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

type TimelineSelectHandler = (timelineId: string) => void
type DraftSelectHandler = (draftId: string) => void
type TimelinesRefreshHandler = () => void

interface SidePanelContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  onTimelineSelect: TimelineSelectHandler
  setOnTimelineSelect: (handler: TimelineSelectHandler | null) => void
  onDraftSelect: DraftSelectHandler
  setOnDraftSelect: (handler: DraftSelectHandler | null) => void
  /** Force the timelines list to refetch (e.g. after deleting from the editor). No-op if nothing is registered. */
  refreshTimelines: () => void
  setRefreshTimelines: (handler: TimelinesRefreshHandler | null) => void
  activeTimelineId: string | null
  setActiveTimelineId: (id: string | null) => void
  activeDraftId: string | null
  setActiveDraftId: (id: string | null) => void
  /** Live title for the active timeline — lets the editor push title edits to the panel before autosave lands. */
  activeTimelineTitle: string | null
  setActiveTimelineTitle: (title: string | null) => void
  /** Live event count for the active timeline/draft so the panel badge updates before autosave lands. */
  activeEventCount: number | null
  setActiveEventCount: (count: number | null) => void
  /** Live dominant-category color for the active timeline/draft so the panel badge color stays in sync. */
  activeDominantCategoryColor: string | null
  setActiveDominantCategoryColor: (color: string | null) => void
}

export const SidePanelContext = createContext<SidePanelContextValue | null>(null)

const STORAGE_KEY = 'side_panel_open'

function readStoredIsOpen(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return true
    return raw === 'true'
  } catch {
    return true
  }
}

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(readStoredIsOpen)
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [activeTimelineTitle, setActiveTimelineTitle] = useState<string | null>(null)
  const [activeEventCount, setActiveEventCount] = useState<number | null>(null)
  const [activeDominantCategoryColor, setActiveDominantCategoryColor] = useState<string | null>(null)
  const navigate = useNavigate()
  const customHandlerRef = useRef<TimelineSelectHandler | null>(null)
  const customDraftHandlerRef = useRef<DraftSelectHandler | null>(null)
  const customRefreshRef = useRef<TimelinesRefreshHandler | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isOpen))
    } catch {
      // storage full or disabled — silently ignore
    }
  }, [isOpen])

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

  const onDraftSelect = useCallback<DraftSelectHandler>((draftId) => {
    if (customDraftHandlerRef.current) {
      customDraftHandlerRef.current(draftId)
    } else {
      navigate('/editor', { state: { draftId } })
    }
  }, [navigate])

  const setOnDraftSelect = useCallback((handler: DraftSelectHandler | null) => {
    customDraftHandlerRef.current = handler
  }, [])

  const refreshTimelines = useCallback(() => {
    customRefreshRef.current?.()
  }, [])

  const setRefreshTimelines = useCallback((handler: TimelinesRefreshHandler | null) => {
    customRefreshRef.current = handler
  }, [])

  const value = useMemo<SidePanelContextValue>(() => ({
    isOpen,
    open,
    close,
    toggle,
    onTimelineSelect,
    setOnTimelineSelect,
    onDraftSelect,
    setOnDraftSelect,
    refreshTimelines,
    setRefreshTimelines,
    activeTimelineId,
    setActiveTimelineId,
    activeDraftId,
    setActiveDraftId,
    activeTimelineTitle,
    setActiveTimelineTitle,
    activeEventCount,
    setActiveEventCount,
    activeDominantCategoryColor,
    setActiveDominantCategoryColor,
  }), [isOpen, open, close, toggle, onTimelineSelect, setOnTimelineSelect, onDraftSelect, setOnDraftSelect, refreshTimelines, setRefreshTimelines, activeTimelineId, activeDraftId, activeTimelineTitle, activeEventCount, activeDominantCategoryColor])

  return (
    <SidePanelContext.Provider value={value}>
      {children}
    </SidePanelContext.Provider>
  )
}
