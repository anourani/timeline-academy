import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePanelWidth } from '@/hooks/usePanelWidth'
import { PANEL_DEFAULT_WIDTH, PANEL_RESIZE_BREAKPOINT } from '@/constants/panels'

type TimelineSelectHandler = (timelineId: string) => void
type DraftSelectHandler = (draftId: string) => void
type TimelinesRefreshHandler = () => void
type OpenSettingsHandler = () => void

interface SidePanelContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  /**
   * Panel footprint in px, gap included. Lives here rather than in
   * `GlobalLayout` because the push layout has two other readers: the content
   * wrapper's `padding-left` and `FloatingToolbar`'s recentering.
   */
  width: number
  setWidth: (width: number) => void
  resetWidth: () => void
  /** True mid-drag, so readers can drop their width transitions and track the cursor. */
  isResizing: boolean
  setIsResizing: (isResizing: boolean) => void
  onTimelineSelect: TimelineSelectHandler
  setOnTimelineSelect: (handler: TimelineSelectHandler | null) => void
  onDraftSelect: DraftSelectHandler
  setOnDraftSelect: (handler: DraftSelectHandler | null) => void
  /** Force the timelines list to refetch (e.g. after deleting from the editor). No-op if nothing is registered. */
  refreshTimelines: () => void
  setRefreshTimelines: (handler: TimelinesRefreshHandler | null) => void
  /** Open the Settings panel. Registered by the editor route; no-op elsewhere. */
  onOpenSettings: OpenSettingsHandler
  setOnOpenSettings: (handler: OpenSettingsHandler | null) => void
  /**
   * Whether `onOpenSettings` currently has somewhere to go. State rather than a
   * read of the ref, because a ref write does not re-render the account menu
   * that needs to know — and a Settings item that is visibly present and does
   * nothing is worse than one that isn't there.
   */
  hasSettingsHandler: boolean
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
const WIDTH_STORAGE_KEY = 'side_panel_width'

/**
 * Open by default — except on a viewport too narrow to hold the panel and
 * anything else beside it. Below `PANEL_RESIZE_BREAKPOINT` the resize handles
 * are hidden and `clampPanelWidth` shrinks the panel to
 * `viewportWidth - MIN_CONTENT_GUTTER`, so a first visit on a phone used to
 * land on a 64px strip of page next to a panel nobody asked for.
 *
 * Only the nothing-stored case moves. A returning user's own choice still wins
 * on every device, and at desktop widths this is the `true` it has always been.
 */
function readStoredIsOpen(): boolean {
  const defaultIsOpen =
    typeof window === 'undefined' || window.innerWidth >= PANEL_RESIZE_BREAKPOINT
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return defaultIsOpen
    return raw === 'true'
  } catch {
    return defaultIsOpen
  }
}

export function SidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(readStoredIsOpen)
  const { width, setWidth, resetWidth } = usePanelWidth(WIDTH_STORAGE_KEY, PANEL_DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [activeTimelineTitle, setActiveTimelineTitle] = useState<string | null>(null)
  const [activeEventCount, setActiveEventCount] = useState<number | null>(null)
  const [activeDominantCategoryColor, setActiveDominantCategoryColor] = useState<string | null>(null)
  const [hasSettingsHandler, setHasSettingsHandler] = useState(false)
  const navigate = useNavigate()
  const customHandlerRef = useRef<TimelineSelectHandler | null>(null)
  const customDraftHandlerRef = useRef<DraftSelectHandler | null>(null)
  const customRefreshRef = useRef<TimelinesRefreshHandler | null>(null)
  const customOpenSettingsRef = useRef<OpenSettingsHandler | null>(null)

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

  const onOpenSettings = useCallback<OpenSettingsHandler>(() => {
    customOpenSettingsRef.current?.()
  }, [])

  const setOnOpenSettings = useCallback((handler: OpenSettingsHandler | null) => {
    customOpenSettingsRef.current = handler
    setHasSettingsHandler(Boolean(handler))
  }, [])

  const value = useMemo<SidePanelContextValue>(() => ({
    isOpen,
    open,
    close,
    toggle,
    width,
    setWidth,
    resetWidth,
    isResizing,
    setIsResizing,
    onTimelineSelect,
    setOnTimelineSelect,
    onDraftSelect,
    setOnDraftSelect,
    refreshTimelines,
    setRefreshTimelines,
    onOpenSettings,
    setOnOpenSettings,
    hasSettingsHandler,
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
  }), [isOpen, open, close, toggle, width, setWidth, resetWidth, isResizing, onTimelineSelect, setOnTimelineSelect, onDraftSelect, setOnDraftSelect, refreshTimelines, setRefreshTimelines, onOpenSettings, setOnOpenSettings, hasSettingsHandler, activeTimelineId, activeDraftId, activeTimelineTitle, activeEventCount, activeDominantCategoryColor])

  return (
    <SidePanelContext.Provider value={value}>
      {children}
    </SidePanelContext.Provider>
  )
}
