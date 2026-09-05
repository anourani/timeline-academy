import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, X } from 'lucide-react'
import { ConfirmationModal } from '../Modal/ConfirmationModal'
import { PanelResizeHandle } from '../ui/PanelResizeHandle'
import { Skeleton, SkeletonText } from '../ui/skeleton'
import { usePanelWidth } from '@/hooks/usePanelWidth'
import { useWindowResizing } from '@/hooks/useWindowResizing'
import { PANEL_DEFAULT_WIDTH } from '@/constants/panels'
import { formatDateLong } from '@/utils/dateUtils'
import {
  enrichEvent,
  fetchEventImage,
} from '@/services/eventEnrichment'
import type { EventSource, TimelineEvent } from '@/types/event'
import type { ByokProvider } from '@/types/ai'
import { PROVIDER_META } from '@/constants/byokProviders'
import { getKey } from '@/services/userApiKey'

interface EventDetailPanelProps {
  open: boolean
  event: TimelineEvent | null
  timelineTitle: string
  mode: 'edit' | 'view'
  onClose: () => void
  onEventChange: (updated: TimelineEvent) => void
  /** Edit-mode authoring actions. Since clicking an event opens this panel
   *  rather than an actions menu, the panel header is where Edit and Delete
   *  live. Omitted in view mode. */
  onEdit?: () => void
  onDelete?: () => void
}

type PanelState = 'idle' | 'generating' | 'loaded' | 'error'

/**
 * The image is a separate request from the description — a Wikipedia lookup
 * that runs alongside the stream — so it needs its own state. Keying its
 * placeholder off `PanelState` meant the frame stopped pulsing the moment the
 * *text* finished, with the picture still in flight, and kept pulsing for the
 * whole generation when Wikipedia had no picture to give.
 *
 * `'settled'` covers found, not-found and failed alike: all three are the end
 * of waiting, and an empty frame is the honest answer to the last two.
 */
type ImageState = 'idle' | 'loading' | 'settled'

/** Ragged on purpose — three equal bars read as a table, not as a list. */
const SOURCE_SKELETON_WIDTHS = ['72%', '54%', '63%']

function formatDateRange(event: TimelineEvent): string {
  if (event.startDate === event.endDate) return formatDateLong(event.startDate)
  return `${formatDateLong(event.startDate)} → ${formatDateLong(event.endDate)}`
}

function hasGeneratedContent(event: TimelineEvent | null): boolean {
  return Boolean(event?.description)
}

export function EventDetailPanel({
  open,
  event,
  timelineTitle,
  mode,
  onClose,
  onEventChange,
  onEdit,
  onDelete,
}: EventDetailPanelProps) {
  const [state, setState] = useState<PanelState>('idle')
  const [streamedDescription, setStreamedDescription] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageAttribution, setImageAttribution] = useState<string | null>(null)
  const [imageState, setImageState] = useState<ImageState>('idle')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [sources, setSources] = useState<EventSource[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [errorProvider, setErrorProvider] = useState<ByokProvider | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  // Shared by the editor and the viewer — this is one component mounted from
  // two routes, so a resize on either follows the reader everywhere.
  const { width, setWidth, resetWidth } = usePanelWidth(
    'event_panel_width',
    PANEL_DEFAULT_WIDTH
  )

  // The other provider, offered only when the user has a key for it. No
  // automatic failover — spending on an account the user didn't pick for this
  // request is a surprise, and it hides that a key is broken.
  const retryProvider: ByokProvider | null = errorProvider
    ? (() => {
        const other: ByokProvider =
          errorProvider === 'openai' ? 'anthropic' : 'openai'
        return getKey(other) ? other : null
      })()
    : null
  const abortRef = useRef<AbortController | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const isWindowResizing = useWindowResizing()
  const skipTransition = isResizing || isWindowResizing

  // Reset state when the panel closes or the event changes.
  useEffect(() => {
    if (!open || !event) {
      // Cleanup any in-flight stream when panel closes.
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      return
    }

    // A new event starts at the top. The panel is reused across events, so
    // without this, opening one inherits wherever the last one was left.
    if (contentRef.current) contentRef.current.scrollTop = 0

    if (hasGeneratedContent(event)) {
      // Cached content — render straight from the event.
      setState('loaded')
      setStreamedDescription(event.description ?? '')
      setImageUrl(event.imageUrl ?? null)
      setImageAttribution(event.imageAttribution ?? null)
      setSources(event.sources ?? [])
      // Nothing is being fetched, so nothing should be pulsing. `imageLoaded`
      // stays false until the <img> paints — a cached URL is still bytes away.
      setImageState('settled')
      setImageLoaded(false)
      return
    }

    // Fresh event — auto-generation runs in either edit or view/present mode.
    // Routing (BYOK key vs session token vs JWT) is handled inside enrichEvent;
    // the panel just kicks off generation.
    setState('generating')
    setStreamedDescription('')
    setImageUrl(null)
    setImageAttribution(null)
    setSources([])
    setErrorMessage('')
    setErrorProvider(null)

    runGeneration(event, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  // Escape closes the panel. Click outside the panel also closes it (desktop
  // has no visible backdrop so the timeline behind stays visible, but a click
  // anywhere off-panel should still dismiss the way Cancel would). Suppress
  // outside-click while a confirmation modal is open so clicking the modal's
  // overlay doesn't also dismiss the panel underneath it.
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (showRemoveConfirm || showRegenerateConfirm || showDeleteConfirm) return
      const node = panelRef.current
      if (!node) return
      const target = e.target as Node | null
      if (target && !node.contains(target)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    // mousedown (not click) so we close before any background element starts
    // its own interaction (e.g. dragging an event).
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [open, onClose, showRemoveConfirm, showRegenerateConfirm, showDeleteConfirm])

  // A confirmation left open when the panel closes would reappear over the next
  // event opened.
  useEffect(() => {
    if (!open) setShowDeleteConfirm(false)
  }, [open])

  function runGeneration(
    currentEvent: TimelineEvent,
    preserveImage: boolean,
    providerOverride?: ByokProvider,
  ) {
    // Abort any prior in-flight generation
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setState('generating')
    setStreamedDescription('')
    if (!preserveImage) {
      setImageUrl(null)
      setImageAttribution(null)
      setImageLoaded(false)
    }
    setSources([])
    setErrorMessage('')
    setErrorProvider(null)

    let descBuffer = ''
    let collectedSources: EventSource[] = []
    let nextImageUrl: string | null = preserveImage ? currentEvent.imageUrl ?? null : null
    let nextImageAttribution: string | null = preserveImage
      ? currentEvent.imageAttribution ?? null
      : null

    // Image fetch in parallel with text streaming. Only re-fetch if not preserving.
    if (!preserveImage) {
      setImageState('loading')
      fetchEventImage(currentEvent.title)
        .then((res) => {
          if (ctrl.signal.aborted) return
          nextImageUrl = res.imageUrl
          nextImageAttribution = res.attribution
          setImageUrl(res.imageUrl)
          setImageAttribution(res.attribution)
          setImageState('settled')
        })
        .catch(() => {
          // `fetchEventImage` already resolves to null/null on failure, so this
          // only fires on something unexpected — but the frame must stop
          // waiting either way rather than pulse forever.
          if (ctrl.signal.aborted) return
          setImageState('settled')
        })
    } else {
      setImageState('settled')
    }

    enrichEvent(
      currentEvent,
      timelineTitle,
      {
        onDelta: (text) => {
          if (ctrl.signal.aborted) return
          descBuffer += text
          setStreamedDescription(descBuffer)
        },
        onSources: (s) => {
          if (ctrl.signal.aborted) return
          collectedSources = s
          setSources(s)
        },
        onDone: () => {
          if (ctrl.signal.aborted) return
          // Persist the full set of fields atomically.
          onEventChange({
            ...currentEvent,
            description: descBuffer || null,
            imageUrl: nextImageUrl,
            imageAttribution: nextImageAttribution,
            sources: collectedSources.length > 0 ? collectedSources : null,
          })
          setState('loaded')
        },
        onError: (message, provider) => {
          if (ctrl.signal.aborted) return
          setErrorMessage(message)
          setErrorProvider(provider ?? null)
          setState('error')
        },
      },
      ctrl.signal,
      providerOverride,
    )
  }

  /** Run generation immediately, no confirmation. Used for error recovery,
   *  where the previous attempt produced nothing to protect. */
  function regenerateNow(providerOverride?: ByokProvider) {
    if (!event) return
    // Preserve image only if we already have one.
    runGeneration(event, !!imageUrl, providerOverride)
  }

  /** Footer "Regenerate", which replaces a description that already worked.
   *  Confirmed because each run is a fresh billed call — on a BYOK key that
   *  is the user's own money, and nothing else in the product caps it. */
  function handleRegenerate() {
    if (!event) return
    setShowRegenerateConfirm(true)
  }

  function handleRemove() {
    if (!event) return
    onEventChange({
      ...event,
      description: null,
      imageUrl: null,
      imageAttribution: null,
      sources: null,
    })
    onClose()
  }

  if (typeof document === 'undefined') return null

  const showFooter = mode === 'edit' && open && !!event
  // Edit and Delete used to live in the click-path actions menu. That menu is
  // gone — a click opens this panel — so the header carries them instead.
  const showAuthoringActions = mode === 'edit' && !!event && !!onEdit && !!onDelete
  const description = state === 'loaded' ? event?.description ?? streamedDescription : streamedDescription
  const displayImageUrl = state === 'loaded' ? event?.imageUrl ?? imageUrl : imageUrl
  const displayAttribution = state === 'loaded' ? event?.imageAttribution ?? imageAttribution : imageAttribution
  const displaySources = state === 'loaded' ? event?.sources ?? sources : sources

  // The description slot rendered nothing at all until the first token landed —
  // seconds, because `enrichEvent` runs a web search before it writes a word.
  const showDescriptionSkeleton = state === 'generating' && description.length === 0
  // Sources arrive on their own callback, usually before the stream finishes.
  const showSourcesSkeleton = state === 'generating' && displaySources.length === 0
  // Pulse while the lookup is in flight, and keep pulsing once a URL is known
  // until the bytes actually paint. Settling with no image stops the pulse: an
  // empty frame is the answer, and an answer should not look like waiting.
  const showImageSkeleton =
    imageState === 'loading' || (!!displayImageUrl && !imageLoaded)

  return createPortal(
    <>
      {/* Backdrop — same bg-black/50 overlay used by FeedbackPanel and
          TimelineSettingsPanel. Clicking dismisses the panel. */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      <aside
        ref={panelRef}
        // Width goes through a custom property rather than an inline `width`
        // so it stays behind the `md:` prefix — below that breakpoint the
        // panel is full-screen off `inset-0` and must not be constrained.
        style={{ '--event-panel-width': `${width}px` } as React.CSSProperties}
        className={`fixed inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[var(--event-panel-width)] md:pr-[6px] md:py-[6px] z-50 ${
          skipTransition ? '' : 'transition-[transform,width] duration-300 ease-out'
        } ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!open}
        aria-label="Event details"
      >
        {open && (
          <PanelResizeHandle
            side="right"
            width={width}
            onWidthChange={setWidth}
            onResizeStateChange={setIsResizing}
            onReset={resetWidth}
            label="Resize event details panel"
          />
        )}
        <div className="h-full w-full bg-[#171717] flex flex-col overflow-hidden border-0 md:border md:border-[#262626] rounded-none md:rounded-[6px]">
          {/* Scroll anchoring is deliberately left at the browser default. It
              was suspected of walking the panel down as the description
              streamed, but measurement says otherwise: appending paragraphs
              below the reader moves nothing, and where anchoring does act — a
              late image or attribution growing *above* the reader — it holds
              them on the same sentence, which is what a reader wants. Turning
              it off would reintroduce that jump. */}
          <div
            ref={contentRef}
            aria-busy={state === 'generating'}
            className="flex flex-col items-stretch p-[24px_20px] gap-[16px] overflow-y-auto flex-1 min-h-0"
          >
            {event && (
              <>
                {/* The skeletons are `aria-hidden`, so this is the only thing
                    telling a screen reader that the panel is mid-generation.
                    `polite` — it must not interrupt whatever is being read. */}
                <p className="sr-only" role="status" aria-live="polite">
                  {state === 'generating'
                    ? 'Generating event details'
                    : state === 'loaded'
                      ? 'Event details ready'
                      : ''}
                </p>

                {/* Date row + authoring actions + mobile close */}
                <div className="flex items-center justify-between gap-3">
                  <p className="label-s-type1 text-[#9B9EA3] m-0">
                    {formatDateRange(event)}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {showAuthoringActions && (
                      <>
                        <HeaderIconButton onClick={onEdit} label="Edit event">
                          <Pencil size={16} strokeWidth={1.25} />
                        </HeaderIconButton>
                        <HeaderIconButton
                          onClick={() => setShowDeleteConfirm(true)}
                          label="Delete event"
                          destructive
                        >
                          <Trash2 size={16} strokeWidth={1.25} />
                        </HeaderIconButton>
                      </>
                    )}
                    <button
                      onClick={onClose}
                      className="md:hidden flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors"
                      aria-label="Close panel"
                    >
                      <X size={16} strokeWidth={1.25} />
                    </button>
                  </div>
                </div>

                {/* Photo frame. Fluid rather than a fixed 274px so it follows
                    a resized panel; the 274/205 ratio is preserved.

                    `shrink-0` is load-bearing. This is a flex item in a column
                    whose content overflows as soon as a description arrives,
                    and an aspect-ratio box has no min-content height to stop
                    flexbox squeezing it — without this the frame collapsed to a
                    2px line the moment the text got long, taking the picture
                    with it. */}
                <div
                  className={`w-full shrink-0 aspect-[274/205] bg-[#0A0A0A] border border-[#525252] rounded-[8px] overflow-hidden ${
                    showImageSkeleton ? 'animate-pulse' : ''
                  }`}
                >
                  {displayImageUrl && (
                    <img
                      src={displayImageUrl}
                      alt={event.title}
                      // Never send the page URL (a /view share link is the
                      // access capability itself) to the image host.
                      referrerPolicy="no-referrer"
                      onLoad={() => setImageLoaded(true)}
                      // A broken URL stops the wait like a successful one — the
                      // frame is empty either way, and pulsing at an image that
                      // will never arrive is the bug this replaces.
                      onError={() => setImageLoaded(true)}
                      className="w-full h-full object-cover rounded-[8px]"
                    />
                  )}
                </div>

                {/* Photo attribution */}
                {displayAttribution && (
                  <p
                    className="m-0"
                    style={{
                      fontFamily: "'Avenir', sans-serif",
                      fontWeight: 400,
                      fontSize: '8px',
                      lineHeight: '140%',
                      color: '#9B9EA3',
                    }}
                  >
                    {displayAttribution}
                  </p>
                )}

                {/* Title */}
                <h2 className="header-xsmall text-[#DADEE5] m-0">{event.title}</h2>

                {/* Description / state */}
                {state === 'error' ? (
                  <div className="flex flex-col gap-2">
                    <p className="body-m text-[#9B9EA3] m-0">
                      Couldn't generate details. {errorMessage ? `(${errorMessage})` : ''}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => regenerateNow()}
                        className="font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#DADEE5] underline hover:text-white"
                      >
                        Try again
                      </button>
                      {retryProvider && (
                        <button
                          onClick={() => regenerateNow(retryProvider)}
                          className="font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#9B9EA3] underline hover:text-[#DADEE5]"
                        >
                          Retry with {PROVIDER_META[retryProvider].label}
                        </button>
                      )}
                    </div>
                  </div>
                ) : showDescriptionSkeleton ? (
                  // Two blocks rather than one run of bars: the reserved height
                  // matches the two-paragraph shape most descriptions come back
                  // in, so the first token replaces the skeleton instead of
                  // pushing the page around. Both vanish together — a skeleton
                  // tail below streaming text dances on every token.
                  <>
                    <SkeletonText lines={4} />
                    <SkeletonText lines={4} />
                  </>
                ) : (
                  description &&
                  description
                    .split(/\n\n+/)
                    .filter((p) => p.trim().length > 0)
                    .map((para, i) => (
                      <p key={i} className="body-m text-[#9B9EA3] m-0 whitespace-pre-wrap">
                        {para}
                      </p>
                    ))
                )}

                {/* Sources */}
                {showSourcesSkeleton && (
                  <div className="flex flex-col gap-0">
                    <h3 className="label-m-type2 text-[#9B9EA3] m-0 mb-2">Sources</h3>
                    {SOURCE_SKELETON_WIDTHS.map((width, i) => (
                      <div
                        key={i}
                        className="flex items-center py-2 border-b border-[#262626] last:border-b-0"
                      >
                        <Skeleton className="h-[14px]" style={{ width }} />
                      </div>
                    ))}
                  </div>
                )}

                {displaySources && displaySources.length > 0 && (
                  <div className="flex flex-col gap-0">
                    <h3 className="label-m-type2 text-[#9B9EA3] m-0 mb-2">Sources</h3>
                    {displaySources.map((source, i) => (
                      <a
                        key={`${source.url}-${i}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="body-m text-[#9B9EA3] underline hover:text-[#DADEE5] py-2 border-b border-[#262626] last:border-b-0 break-words"
                      >
                        {source.title || source.url}
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {showFooter && (
            <div className="flex gap-[10px] px-[20px] pb-[20px] pt-[12px] shrink-0">
              <FooterButton onClick={handleRegenerate} disabled={state === 'generating'}>
                Regenerate
              </FooterButton>
              <FooterButton onClick={() => setShowRemoveConfirm(true)} disabled={state === 'generating'}>
                Remove
              </FooterButton>
            </div>
          )}
        </div>
      </aside>

      <ConfirmationModal
        isOpen={showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={handleRemove}
        title="Remove event details"
        message="This will clear the description, image, and sources for this event. The event itself will not be deleted."
        confirmLabel="Remove"
        cancelLabel="Cancel"
      />

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false)
          onDelete?.()
        }}
        title="Delete event"
        message={
          event
            ? `"${event.title}" will be removed from the timeline. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />

      <ConfirmationModal
        isOpen={showRegenerateConfirm}
        onClose={() => setShowRegenerateConfirm(false)}
        onConfirm={() => regenerateNow()}
        title="Regenerate description?"
        message="This replaces the current description and runs a new AI request, including a fresh web search. If you're using your own API key, it will be billed to that account."
        confirmLabel="Regenerate"
        cancelLabel="Cancel"
      />
    </>,
    document.body,
  )
}

function HeaderIconButton({
  children,
  onClick,
  label,
  destructive,
}: {
  children: React.ReactNode
  onClick?: () => void
  label: string
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 transition-colors ${
        destructive
          ? 'text-destructive hover:text-destructive'
          : 'text-[#c9ced4] hover:text-[#dadee5]'
      }`}
    >
      {children}
    </button>
  )
}

function FooterButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center justify-center h-[33px] px-[10px] py-[5px] rounded-[10px] border border-white/[0.15] bg-white/10 backdrop-blur-[12px] shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_1px_rgba(255,255,255,0.1)] font-['Avenir',sans-serif] font-medium text-[14px] leading-[150%] text-[#C9CED4] hover:bg-white/20 hover:text-[#dadee5] transition-colors disabled:opacity-50 disabled:pointer-events-none"
    >
      {children}
    </button>
  )
}
