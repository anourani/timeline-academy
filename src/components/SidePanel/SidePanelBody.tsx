import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Balloon,
  Copy,
  Download,
  FileDown,
  FileSpreadsheet,
  Flower,
  LogOut,
  MoreVertical,
  PanelLeft,
  Share2,
  Trash2,
  Video,
} from 'lucide-react'
import { utils, writeFile } from 'xlsx'
import { useAuth } from '@/hooks/useAuth'
import { useSidePanel } from '@/hooks/useSidePanel'
import { useTimelines } from '@/hooks/useTimelines'
import { useTimelineMetadata } from '@/hooks/useTimelineMetadata'
import { computeDominantCategoryColor, DEFAULT_DOT_COLOR } from '@/utils/dominantCategory'
import { supabase } from '@/lib/supabase'
import { ConfirmationModal } from '@/components/Modal/ConfirmationModal'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FeedbackPanel } from '@/components/FeedbackPanel/FeedbackPanel'
import { ImportCSVModal } from '@/components/AIMode/ImportCSVModal'
import { AuthModal } from '@/components/Auth/AuthModal'
import { DEFAULT_TIMELINE_TITLE } from '@/constants/defaults'
import {
  getAllDrafts,
  getDraft,
  saveDraft,
  deleteDraft as deleteLocalDraft,
  MAX_DRAFTS,
  type LocalDraft,
} from '@/utils/draftStorage'
import { exportEventsToExcel } from '@/utils/excelExport'
import type { TimelineEvent } from '@/types/event'
import { EventCounter } from './EventCounter'
import { SidePanelActionButton } from './SidePanelActionButton'

interface TileRow {
  id: string
  title: string
  kind: 'timeline' | 'draft'
}

function TileMenuButton({
  onShare,
  onDuplicate,
  onExport,
  onDelete,
}: {
  onShare?: () => void
  onDuplicate?: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.gsp-tile-menu')) setOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [open])

  return (
    <div className="gsp-tile-menu relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(prev => !prev)
        }}
        className="p-1 text-[#9b9ea3] hover:text-[#dadee5] rounded transition-colors"
        aria-label="More options"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+4px)] z-10 w-36 bg-[#171717] border border-[#404040] rounded-md py-1 shadow-lg"
          style={{ filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))' }}
        >
          {onShare && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onShare()
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-[#c9ced4] hover:bg-white/5"
            >
              <Share2 size={14} />
              Share
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onDuplicate()
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-[#c9ced4] hover:bg-white/5"
            >
              <Copy size={14} />
              Duplicate
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onExport()
            }}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-[#c9ced4] hover:bg-white/5"
          >
            <FileDown size={14} />
            Export data
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onDelete()
            }}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-destructive hover:bg-white/5"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export function SidePanelBody() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isOpen, close, onTimelineSelect, onDraftSelect, activeTimelineId, activeDraftId, activeTimelineTitle, activeEventCount, activeDominantCategoryColor } = useSidePanel()
  const { timelines, isLoading, error, loadTimelines } = useTimelines()
  const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([])
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingDeleteKind, setPendingDeleteKind] = useState<'timeline' | 'draft' | null>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  const [isVideoTutorialOpen, setIsVideoTutorialOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  useEffect(() => {
    if (!user) {
      setLocalDrafts(getAllDrafts())
    } else {
      setLocalDrafts([])
    }
  }, [user, isOpen])

  // Freshen the list when the panel opens so the tile labels reflect any
  // recent edits that haven't come through the realtime channel yet.
  useEffect(() => {
    if (isOpen && user) {
      loadTimelines()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user])

  const rows = useMemo<TileRow[]>(() => {
    const baseRows: TileRow[] = user
      ? timelines.map(t => ({ id: t.id, title: t.title || DEFAULT_TIMELINE_TITLE, kind: 'timeline' as const }))
      : localDrafts.map(d => ({ id: d.id, title: d.title || DEFAULT_TIMELINE_TITLE, kind: 'draft' as const }))

    // If the editor's active timeline isn't in the fetched list yet (new-timeline
    // race, stale list, or dropped realtime event), synthesize a tile for it at
    // the top using live context values so the user always sees their session.
    const hasActiveRow = !!(user && activeTimelineId && baseRows.some(r => r.kind === 'timeline' && r.id === activeTimelineId))
    if (!hasActiveRow && user && activeTimelineId) {
      return [
        {
          id: activeTimelineId,
          title: activeTimelineTitle && activeTimelineTitle.length > 0
            ? activeTimelineTitle
            : DEFAULT_TIMELINE_TITLE,
          kind: 'timeline' as const,
        },
        ...baseRows,
      ]
    }
    return baseRows
  }, [user, timelines, localDrafts, activeTimelineId, activeTimelineTitle])

  const timelineIds = useMemo(
    () => rows.filter(r => r.kind === 'timeline').map(r => r.id),
    [rows],
  )
  const timelineMetadata = useTimelineMetadata(timelineIds)

  const handleTileClick = (row: TileRow) => {
    if (row.kind === 'timeline') {
      onTimelineSelect(row.id)
    } else {
      onDraftSelect(row.id)
    }
    // Panel stays open — it's only toggled via the panel-left button
  }

  const confirmDelete = (row: TileRow) => {
    setPendingDeleteId(row.id)
    setPendingDeleteKind(row.kind)
  }

  const handleExport = async (row: TileRow) => {
    try {
      const title = row.title || DEFAULT_TIMELINE_TITLE
      if (row.kind === 'draft') {
        const draft = getDraft(row.id)
        if (!draft) {
          alert('Could not find draft to export.')
          return
        }
        exportEventsToExcel(draft.events, title)
        return
      }

      const { data, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('timeline_id', row.id)
      if (fetchError) throw fetchError

      const events = (data || []).map(event => ({
        id: event.id,
        title: event.title,
        startDate: event.start_date,
        endDate: event.end_date,
        category: event.category,
      }))
      exportEventsToExcel(events, title)
    } catch (err) {
      console.error('Failed to export timeline:', err)
      alert('Failed to export. Please try again.')
    }
  }

  const handleDelete = async () => {
    if (!pendingDeleteId || !pendingDeleteKind) return
    try {
      if (pendingDeleteKind === 'timeline') {
        const { error: deleteError } = await supabase
          .from('timelines')
          .delete()
          .eq('id', pendingDeleteId)
        if (deleteError) throw deleteError
        if (pendingDeleteId === activeTimelineId) {
          const remaining = timelines.find(t => t.id !== pendingDeleteId)
          if (remaining) {
            onTimelineSelect(remaining.id)
          } else {
            onTimelineSelect('new')
          }
        }
        loadTimelines()
      } else {
        deleteLocalDraft(pendingDeleteId)
        setLocalDrafts(getAllDrafts())
      }
    } catch (err) {
      console.error('Failed to delete:', err)
      alert('Failed to delete. Please try again.')
    } finally {
      setPendingDeleteId(null)
      setPendingDeleteKind(null)
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      close()
    } catch (err) {
      console.error('Error signing out:', err)
      alert('Failed to sign out. Please try again.')
    } finally {
      setShowSignOutConfirm(false)
    }
  }

  const handleBuildWithAI = () => {
    navigate('/')
  }

  const handleBuildFromScratch = () => {
    if (user) {
      navigate('/editor', { state: { timelineId: 'new', skipCreationScreen: true } })
    } else {
      navigate('/editor', { state: { newTimeline: true, skipCreationScreen: true } })
    }
  }

  const handleImportData = () => {
    setIsImportOpen(true)
  }

  const handleDownloadTemplate = () => {
    const wb = utils.book_new()
    const headers = ['Event Title', 'Start Date', 'End Date', 'Category']
    const instructions = [
      '55 char limit',
      'Format: MM/DD/YYYY',
      'Format: MM/DD/YYYY',
      'Must match a timeline category',
    ]
    const data = [
      headers,
      instructions,
      ['Sample Event 1', '1/15/2024', '1/20/2024', 'Personal Life'],
      ['Sample Event 2', '10/14/2024', '10/16/2024', 'Career'],
    ]
    const ws = utils.aoa_to_sheet(data)
    utils.book_append_sheet(wb, ws, 'Timeline Events')
    writeFile(wb, 'timeline-template.xlsx')
  }

  const handleImportEvents = (events: TimelineEvent[]) => {
    setIsImportOpen(false)
    navigate('/editor', { state: { importedEvents: events } })
  }

  const handleShare = (row: TileRow) => {
    if (row.kind === 'draft') {
      setIsAuthModalOpen(true)
      return
    }
    const shareUrl = `${window.location.origin}/view/${row.id}`
    navigator.clipboard.writeText(shareUrl)
    alert('Share link copied to clipboard!')
  }

  const handleDuplicate = async (row: TileRow) => {
    if (row.kind === 'draft') {
      const original = getDraft(row.id)
      if (!original) {
        alert('Could not find draft to duplicate.')
        return
      }
      if (getAllDrafts().length >= MAX_DRAFTS) {
        alert('Draft limit reached. Sign in to save more timelines.')
        return
      }
      const clone: LocalDraft = {
        ...original,
        id: crypto.randomUUID(),
        title: `${original.title} (Copy)`,
        savedAt: new Date().toISOString(),
      }
      saveDraft(clone)
      setLocalDrafts(getAllDrafts())
      return
    }

    if (!user) return
    try {
      const { data: original, error: fetchError } = await supabase
        .from('timelines')
        .select('*')
        .eq('id', row.id)
        .single()
      if (fetchError || !original) throw fetchError

      const { data: newTimeline, error: createError } = await supabase
        .from('timelines')
        .insert({
          title: `${original.title} (Copy)`,
          user_id: user.id,
          scale: original.scale,
        })
        .select()
        .single()
      if (createError || !newTimeline) throw createError

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('timeline_id', row.id)
      if (eventsError) throw eventsError

      if (events && events.length > 0) {
        const newEvents = events.map((event) => ({
          title: event.title,
          start_date: event.start_date,
          end_date: event.end_date,
          category: event.category,
          timeline_id: newTimeline.id,
        }))
        const { error: insertError } = await supabase
          .from('events')
          .insert(newEvents)
        if (insertError) throw insertError
      }

      loadTimelines()
    } catch (err) {
      console.error('Error duplicating timeline:', err)
      alert('Failed to duplicate timeline. Please try again.')
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2 border-b border-[#404040] shrink-0">
        <button
          onClick={() => navigate('/')}
          className="font-['Aleo',serif] font-normal text-[18px] leading-[1.4] text-[#c9ced4] hover:text-[#dadee5] transition-colors bg-transparent border-none p-0 cursor-pointer"
        >
          Timelines
        </button>
        <button
          onClick={close}
          className="relative flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors"
          aria-label="Close timelines panel"
        >
          <PanelLeft size={20} />
        </button>
      </div>

      {/* Creation actions */}
      <div className="flex flex-col p-3 shrink-0">
        <SidePanelActionButton icon={Flower} label="Build with AI" onClick={handleBuildWithAI} />
        <SidePanelActionButton icon={Balloon} label="Build from Scratch" onClick={handleBuildFromScratch} />
        <SidePanelActionButton icon={FileSpreadsheet} label="Import Data" onClick={handleImportData} />
        <SidePanelActionButton icon={Download} label="Download Template" onClick={handleDownloadTemplate} />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col p-3">
          {!user && rows.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <p className="text-[14px] text-[#9b9ea3] leading-[20px]">
                Sign in to save timelines and access them from anywhere.
              </p>
            </div>
          ) : isLoading && user ? (
            <div className="px-2 py-4 text-[14px] text-[#9b9ea3]">Loading timelines…</div>
          ) : error && user ? (
            <div className="px-2 py-4">
              <p className="text-[14px] text-[#9b9ea3] mb-2">{error}</p>
              <button
                onClick={() => loadTimelines()}
                className="text-[14px] text-[#c9ced4] underline hover:text-[#dadee5]"
              >
                Try again
              </button>
            </div>
          ) : (
            rows.map((row) => {
              const isActive = row.kind === 'timeline'
                ? row.id === activeTimelineId
                : row.id === activeDraftId
              // When the editor is actively showing this timeline, trust its
              // live title over whatever the fetched list still has cached.
              const displayTitle = isActive && activeTimelineTitle != null
                ? (activeTimelineTitle.length > 0 ? activeTimelineTitle : DEFAULT_TIMELINE_TITLE)
                : row.title

              let count = 0
              let badgeColor = DEFAULT_DOT_COLOR
              if (row.kind === 'timeline') {
                const meta = timelineMetadata.get(row.id)
                count = meta?.eventCount ?? 0
                badgeColor = meta?.dominantCategoryColor ?? DEFAULT_DOT_COLOR
              } else {
                const draft = localDrafts.find(d => d.id === row.id)
                if (draft) {
                  count = draft.events.length
                  badgeColor = computeDominantCategoryColor(draft.events, draft.categories)
                }
              }
              // When the editor is live on this row, trust its in-memory event
              // count and dominant color over the fetched metadata (which only
              // refreshes when the timeline ID set changes).
              if (isActive) {
                if (activeEventCount != null) count = activeEventCount
                if (activeDominantCategoryColor != null) badgeColor = activeDominantCategoryColor
              }

              return (
                <div
                  key={`${row.kind}:${row.id}`}
                  className={`group flex items-center gap-1 px-1.5 py-2.5 h-10 rounded-[10px] transition-colors ${
                    isActive ? 'bg-surface-primary' : 'hover:bg-[#262626]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleTileClick(row)}
                    className="flex-1 min-w-0 flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer text-left"
                  >
                    <span className="label-s-type1 shrink-0 w-4 text-left" style={{ color: badgeColor }}>
                      {count}
                    </span>
                    <span
                      className={`flex-1 min-w-0 body-m truncate transition-colors ${
                        isActive
                          ? 'text-[#dadee5]'
                          : 'text-[#9b9ea3] group-hover:text-[#dadee5]'
                      }`}
                    >
                      {displayTitle}
                    </span>
                  </button>
                  <div
                    className={`shrink-0 transition-opacity ${
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <TileMenuButton
                      onShare={() => handleShare(row)}
                      onDuplicate={() => handleDuplicate(row)}
                      onExport={() => handleExport(row)}
                      onDelete={() => confirmDelete(row)}
                    />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Action links: How it works / Feedback */}
      <div className="flex flex-col items-start p-3 shrink-0">
        <SidePanelActionButton label="How it works" onClick={() => setIsVideoTutorialOpen(true)} />
        <SidePanelActionButton label="Feedback" onClick={() => setIsFeedbackOpen(true)} />
      </div>

      {/* Event Counter */}
      <div className="px-3 pb-3 shrink-0">
        <EventCounter />
      </div>

      {/* Footer */}
      {user && (
        <div className="border-t border-[#404040] px-5 pt-3 pb-4 shrink-0">
          <div className="flex items-center justify-between gap-2 py-1.5">
            <p className="flex-1 min-w-0 font-['Avenir',sans-serif] text-[16px] leading-[24px] text-[#9b9ea3] truncate">
              {user.email}
            </p>
            <button
              onClick={() => setShowSignOutConfirm(true)}
              className="shrink-0 p-1 text-[#9b9ea3] hover:text-[#dadee5] rounded transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={pendingDeleteId !== null}
        onClose={() => {
          setPendingDeleteId(null)
          setPendingDeleteKind(null)
        }}
        onConfirm={handleDelete}
        title="Delete Timeline"
        message="Are you sure you want to delete this timeline? This action cannot be undone."
        confirmLabel="Delete Timeline"
        cancelLabel="Cancel"
      />

      <ConfirmationModal
        isOpen={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={handleSignOut}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
      />

      <ImportCSVModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportEvents={handleImportEvents}
      />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      <FeedbackPanel open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen} />

      <Dialog open={isVideoTutorialOpen} onOpenChange={setIsVideoTutorialOpen}>
        <DialogContent className="max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Quick Tutorial to Get Started</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              This video tutorial walks through how to start building your timeline by adding events, editing categories, customizing timeline settings, and importing or exporting data to build faster.
            </p>
            <div className="aspect-video">
              <a
                href="https://www.loom.com/share/f19575818a9341d4a266c482af981ba2"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full bg-secondary rounded-lg flex items-center justify-center hover:bg-secondary/80 transition-colors"
              >
                <div className="text-center p-6">
                  <Video size={48} className="mx-auto mb-4" />
                  <p>Click to watch the tutorial video on Loom</p>
                  <p className="text-sm text-muted-foreground mt-2">The video will open in a new tab</p>
                </div>
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
