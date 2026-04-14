import { useEffect, useState } from 'react'
import { MoreVertical, PanelLeft, Trash2, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanel } from '@/contexts/SidePanelContext'
import { useTimelines } from '@/hooks/useTimelines'
import { supabase } from '@/lib/supabase'
import { ConfirmationModal } from '@/components/Modal/ConfirmationModal'
import { DEFAULT_TIMELINE_TITLE } from '@/constants/defaults'
import { getAllDrafts, deleteDraft as deleteLocalDraft, type LocalDraft } from '@/utils/draftStorage'

interface TileRow {
  id: string
  title: string
  kind: 'timeline' | 'draft'
}

function TileMenuButton({ onDelete }: { onDelete: () => void }) {
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

export function GlobalSidePanel() {
  const { user } = useAuth()
  const { isOpen, close, onTimelineSelect, onDraftSelect, activeTimelineId, activeDraftId, activeTimelineTitle } = useSidePanel()
  const { timelines, isLoading, error, loadTimelines } = useTimelines()
  const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([])
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingDeleteKind, setPendingDeleteKind] = useState<'timeline' | 'draft' | null>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

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

  const baseRows: TileRow[] = user
    ? timelines.map(t => ({ id: t.id, title: t.title || DEFAULT_TIMELINE_TITLE, kind: 'timeline' as const }))
    : localDrafts.map(d => ({ id: d.id, title: d.title || DEFAULT_TIMELINE_TITLE, kind: 'draft' as const }))

  // If the editor's active timeline isn't in the fetched list yet (new-timeline
  // race, stale list, or dropped realtime event), synthesize a tile for it at
  // the top using live context values so the user always sees their session.
  const hasActiveRow = !!(user && activeTimelineId && baseRows.some(r => r.kind === 'timeline' && r.id === activeTimelineId))
  const rows: TileRow[] = (!hasActiveRow && user && activeTimelineId)
    ? [
        {
          id: activeTimelineId,
          title: activeTimelineTitle && activeTimelineTitle.length > 0
            ? activeTimelineTitle
            : DEFAULT_TIMELINE_TITLE,
          kind: 'timeline' as const,
        },
        ...baseRows,
      ]
    : baseRows

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

  return (
    <>
      <div
        className="h-full w-[320px] bg-[#171717] rounded-tr-2xl rounded-br-2xl flex flex-col overflow-hidden"
        aria-label="Timelines side panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2 border-b border-[#404040] shrink-0">
          <p className="font-['Aleo',serif] font-normal text-[18px] leading-[1.4] text-[#c9ced4]">
            Timelines
          </p>
          <button
            onClick={close}
            className="relative flex items-center justify-center p-1.5 rounded-md border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors"
            aria-label="Close timelines panel"
          >
            <PanelLeft size={20} />
          </button>
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
                return (
                  <div
                    key={`${row.kind}:${row.id}`}
                    className={`group flex items-center gap-4 px-2 py-3 rounded-lg transition-colors ${
                      isActive ? 'bg-white/10' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleTileClick(row)}
                      className={`flex-1 min-w-0 text-left font-['Avenir',sans-serif] text-[16px] leading-[24px] truncate bg-transparent border-none p-0 cursor-pointer transition-colors ${
                        isActive
                          ? 'text-[#dadee5]'
                          : 'text-[#9b9ea3] hover:text-[#c9ced4]'
                      }`}
                    >
                      {displayTitle}
                    </button>
                    <div
                      className={`shrink-0 transition-opacity ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <TileMenuButton onDelete={() => confirmDelete(row)} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
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
      </div>

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
    </>
  )
}
