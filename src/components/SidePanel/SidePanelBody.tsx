import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CirclePlus,
  Copy,
  Download,
  FileDown,
  FileSpreadsheet,
  LogOut,
  MoreVertical,
  PanelLeft,
  Share2,
  Telescope,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useSidePanel } from '@/hooks/useSidePanel'
import { useTimelines } from '@/hooks/useTimelines'
import { useTimelineMetadata } from '@/hooks/useTimelineMetadata'
import { computeDominantCategoryColor, DEFAULT_DOT_COLOR } from '@/utils/dominantCategory'
import { supabase } from '@/lib/supabase'
import { ConfirmationModal } from '@/components/Modal/ConfirmationModal'
import { ImportCSVModal } from '@/components/AIMode/ImportCSVModal'
import { AuthModal } from '@/components/Auth/AuthModal'
import { DEFAULT_TIMELINE_TITLE } from '@/constants/defaults'
import {
  byokAnonDraftStore,
  DRAFTS_CHANGED_EVENT,
  MAX_DRAFTS,
  type LocalDraft,
} from '@/utils/draftStorage'
import { exportEventsToExcel } from '@/utils/excelExport'
import { downloadTemplate } from '@/utils/excelSheet'
import type { TimelineEvent } from '@/types/event'
import { UsageLimits } from './UsageLimits'
import { SidePanelActionButton } from './SidePanelActionButton'

interface TileRow {
  id: string
  title: string
  kind: 'timeline' | 'draft'
}

function TileMenuButton({
  onShare,
  onUnshare,
  onDuplicate,
  onExport,
  onDelete,
}: {
  onShare?: () => void
  onUnshare?: () => void
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
          {onUnshare && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onUnshare()
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-[#c9ced4] hover:bg-white/5"
            >
              <Share2 size={14} />
              Unshare
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
  const tier = useAccountTier()
  const { isOpen, close, onTimelineSelect, onDraftSelect, setRefreshTimelines, activeTimelineId, activeDraftId, activeTimelineTitle, activeEventCount, activeDominantCategoryColor } = useSidePanel()
  const { timelines, isLoading, error, loadTimelines } = useTimelines()
  const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([])
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingDeleteKind, setPendingDeleteKind] = useState<'timeline' | 'draft' | null>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  // `activeDraftId` is in the deps because it is the only signal this component
  // gets that the guest's draft list changed. This panel lives outside the
  // router's <Outlet /> and is hidden with a transform rather than unmounted, so
  // navigating to /editor never remounts it — without this, a draft created in
  // the editor stayed invisible until the panel was toggled or the page
  // reloaded, and the empty-state "sign in to save timelines" copy rendered
  // where the new tile should have been. Signed-in users get this for free from
  // the realtime channel; guests have no equivalent.
  useEffect(() => {
    // byok-anon only. A trial visitor's single timeline lives in sessionStorage
    // and is intentionally absent from this list: it has no saved existence to
    // list, and every affordance on a tile (share, duplicate, export, delete)
    // either can't work or doesn't mean anything for one ephemeral item.
    if (tier === 'byok-anon') {
      setLocalDrafts(byokAnonDraftStore.getAllDrafts())
    } else {
      setLocalDrafts([])
    }
  }, [tier, isOpen, activeDraftId])

  // Re-read whenever the draft store is written, so a guest's edit reorders
  // the list as it happens rather than sitting still and then snapping the next
  // time they switch drafts. Naturally rate-limited by the 500 ms draft
  // debounce — and an immediate re-read wouldn't work anyway, since the write
  // is what it needs to observe.
  useEffect(() => {
    if (tier !== 'byok-anon') return
    const reread = () => setLocalDrafts(byokAnonDraftStore.getAllDrafts())
    window.addEventListener(DRAFTS_CHANGED_EVENT, reread)
    return () => window.removeEventListener(DRAFTS_CHANGED_EVENT, reread)
  }, [tier])

  // Freshen the list when the panel opens so the tile labels reflect any
  // recent edits that haven't come through the realtime channel yet.
  const rows = useMemo<TileRow[]>(() => {
    const baseRows: TileRow[] = user
      ? timelines.map(t => ({ id: t.id, title: t.title || DEFAULT_TIMELINE_TITLE, kind: 'timeline' as const }))
      : localDrafts.map(d => ({ id: d.id, title: d.title || DEFAULT_TIMELINE_TITLE, kind: 'draft' as const }))

    // If whatever the editor has open isn't in the list yet (new-timeline race,
    // stale list, or dropped realtime event), synthesize a tile for it at the
    // top using live context values so the user always sees their session.
    //
    // Guests need this at least as much as signed-in users: their draft is
    // written to localStorage by the editor, and the read above can easily lose
    // the race with it.
    //
    // Trial is excluded on purpose. `activeDraftId` is set for them too, so
    // without the tier check this fallback would synthesize the very tile the
    // list above deliberately leaves out — and it would be the only row there,
    // implying a saved timeline that doesn't exist.
    const activeId = user ? activeTimelineId : tier === 'byok-anon' ? activeDraftId : null
    const activeKind = user ? ('timeline' as const) : ('draft' as const)
    const hasActiveRow = !!(activeId && baseRows.some(r => r.kind === activeKind && r.id === activeId))
    if (!hasActiveRow && activeId) {
      return [
        {
          id: activeId,
          title: activeTimelineTitle && activeTimelineTitle.length > 0
            ? activeTimelineTitle
            : DEFAULT_TIMELINE_TITLE,
          kind: activeKind,
        },
        ...baseRows,
      ]
    }
    return baseRows
  }, [user, tier, timelines, localDrafts, activeTimelineId, activeDraftId, activeTimelineTitle])

  const timelineIds = useMemo(
    () => rows.filter(r => r.kind === 'timeline').map(r => r.id),
    [rows],
  )
  const { metadata: timelineMetadata, applyLocalMetadata, refresh: refreshMetadata } = useTimelineMetadata(timelineIds)

  // Freshen the list when the panel opens so the tile labels reflect any
  // recent edits that haven't come through the realtime channel yet.
  useEffect(() => {
    if (isOpen && user) {
      loadTimelines()
      // Counts and colour dots come from a separate query keyed on the set of
      // timeline ids, so it never notices a timeline's *contents* changing.
      // Refresh it explicitly or the badges stay at page-load values.
      refreshMetadata()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user])

  // Expose the refresh to the context so actions originating outside this
  // component (e.g. deleting from the editor's settings panel) can force an
  // immediate refetch instead of waiting on the realtime channel. Refreshes
  // both the rows and their metadata — the realtime channel covers `timelines`
  // only, never `events`.
  //
  // These two effects live below useTimelineMetadata rather than beside the
  // other subscriptions above because they name `refreshMetadata` in their
  // dependency arrays, which are evaluated during render.
  useEffect(() => {
    setRefreshTimelines(() => {
      loadTimelines()
      refreshMetadata()
    })
    return () => setRefreshTimelines(null)
  }, [setRefreshTimelines, loadTimelines, refreshMetadata])

  // Write the editor's live numbers for the timeline it currently has open into
  // the metadata map, continuously while it is open.
  //
  // The tile for the *active* timeline already renders from these context
  // values directly (below), so this exists for the moment it stops being
  // active: without it the tile falls back to whatever the last fetch returned
  // — in practice the page-load value — and the badge visibly reverts to a
  // stale count the instant you switch to another timeline.
  //
  // Safe only because `activeTimelineId` and `activeEventCount` now reach the
  // context in the same commit (App's applyLoadedTimeline sets the id and the
  // contents in one batch). Before that, this could have filed one timeline's
  // count under another's id.
  useEffect(() => {
    if (!activeTimelineId) return
    if (activeEventCount == null && activeDominantCategoryColor == null) return
    applyLocalMetadata(activeTimelineId, {
      ...(activeEventCount != null ? { eventCount: activeEventCount } : {}),
      ...(activeDominantCategoryColor != null ? { dominantCategoryColor: activeDominantCategoryColor } : {}),
    })
  }, [activeTimelineId, activeEventCount, activeDominantCategoryColor, applyLocalMetadata])

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
        const draft = byokAnonDraftStore.getDraft(row.id)
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
    const wasActive = pendingDeleteKind === 'timeline'
      ? pendingDeleteId === activeTimelineId
      : pendingDeleteId === activeDraftId
    try {
      if (pendingDeleteKind === 'timeline') {
        const { error: deleteError } = await supabase
          .from('timelines')
          .delete()
          .eq('id', pendingDeleteId)
        if (deleteError) throw deleteError
        loadTimelines()
      } else {
        byokAnonDraftStore.deleteDraft(pendingDeleteId)
        setLocalDrafts(byokAnonDraftStore.getAllDrafts())
      }
      // If the user just deleted the timeline/draft they were viewing in the
      // editor, land them back on home instead of leaving the deleted content
      // on screen.
      if (wasActive) {
        navigate('/')
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

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return
    setIsDeletingAccount(true)
    try {
      const { data, error: deleteError } = await supabase.functions.invoke('delete-account')
      if (deleteError || data?.error) {
        throw new Error(data?.error || deleteError?.message || 'Deletion failed')
      }
      // The auth record is gone server-side; clear the local session too.
      await supabase.auth.signOut()
      close()
      navigate('/')
      alert('Your account and all its data have been deleted.')
    } catch (err) {
      console.error('Failed to delete account:', err)
      alert('Failed to delete your account. Please try again or contact alex@timeline.academy.')
    } finally {
      setIsDeletingAccount(false)
      setShowDeleteAccountConfirm(false)
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
    void downloadTemplate(55, ['Personal Life', 'Career'])
  }

  const handleImportEvents = (events: TimelineEvent[]) => {
    setIsImportOpen(false)
    navigate('/editor', { state: { importedEvents: events } })
  }

  const handleShare = async (row: TileRow) => {
    if (row.kind === 'draft') {
      setIsAuthModalOpen(true)
      return
    }
    // Copy synchronously so the clipboard write stays inside the user gesture,
    // then mark the timeline public so the link actually resolves for viewers.
    const shareUrl = `${window.location.origin}/view/${row.id}`
    navigator.clipboard.writeText(shareUrl)
    const { error: shareError } = await supabase
      .from('timelines')
      .update({ is_public: true })
      .eq('id', row.id)
    if (shareError) {
      console.error('Failed to make timeline public:', shareError)
      alert('Could not enable sharing for this timeline. Please try again.')
      return
    }
    alert('Share link copied to clipboard! Anyone with the link can view this timeline.')
  }

  const handleUnshare = async (row: TileRow) => {
    const { error: unshareError } = await supabase
      .from('timelines')
      .update({ is_public: false })
      .eq('id', row.id)
    if (unshareError) {
      console.error('Failed to unshare timeline:', unshareError)
      alert('Could not stop sharing this timeline. Please try again.')
      return
    }
    alert('Sharing disabled. Previously copied links no longer work.')
  }

  const handleDuplicate = async (row: TileRow) => {
    if (row.kind === 'draft') {
      const original = byokAnonDraftStore.getDraft(row.id)
      if (!original) {
        alert('Could not find draft to duplicate.')
        return
      }
      if (byokAnonDraftStore.getAllDrafts().length >= MAX_DRAFTS) {
        alert('Draft limit reached. Sign in to save more timelines.')
        return
      }
      const clone: LocalDraft = {
        ...original,
        id: crypto.randomUUID(),
        title: `${original.title} (Copy)`,
        savedAt: new Date().toISOString(),
      }
      byokAnonDraftStore.saveDraft(clone)
      setLocalDrafts(byokAnonDraftStore.getAllDrafts())
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
          <PanelLeft size={16} strokeWidth={1.25} />
        </button>
      </div>

      {/* Creation actions */}
      <div className="flex flex-col p-3 shrink-0">
        <SidePanelActionButton icon={Telescope} label="AI Timeline" onClick={handleBuildWithAI} />
        <SidePanelActionButton icon={CirclePlus} label="New Timeline" onClick={handleBuildFromScratch} />
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
          ) : error && user && rows.length === 0 ? (
            // Only when there is nothing to show. `error` is also set when the
            // realtime channel drops, and replacing a perfectly good list with
            // an error card over a websocket blip is worse than saying nothing.
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
                      onUnshare={row.kind === 'timeline' ? () => handleUnshare(row) : undefined}
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

      {/* Usage Limits */}
      <div className="shrink-0">
        <UsageLimits />
      </div>

      {/* Footer */}
      <div className="border-t border-[#404040] px-5 pt-3 pb-4 shrink-0">
        {user && (
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
        )}
        <div className="flex items-center gap-3 pt-1 text-[12px] text-[#6b6e73]">
          <Link to="/privacy" className="hover:text-[#9b9ea3] transition-colors">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-[#9b9ea3] transition-colors">
            Terms
          </Link>
          {user && (
            <button
              onClick={() => setShowDeleteAccountConfirm(true)}
              className="ml-auto hover:text-destructive transition-colors"
            >
              Delete account
            </button>
          )}
        </div>
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

      <ConfirmationModal
        isOpen={showDeleteAccountConfirm}
        onClose={() => setShowDeleteAccountConfirm(false)}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message="This permanently deletes your account, your email, and every timeline you've saved. This cannot be undone. Consider exporting your timelines first."
        confirmLabel={isDeletingAccount ? 'Deleting…' : 'Delete Account'}
        cancelLabel="Cancel"
      />

      <ImportCSVModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportEvents={handleImportEvents}
      />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  )
}
