import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, X } from 'lucide-react'
import { ConfirmationModal } from '../Modal/ConfirmationModal'
import { PanelResizeHandle } from '../ui/PanelResizeHandle'
import { Skeleton, SkeletonText } from '../ui/skeleton'
import { usePanelWidth } from '@/hooks/usePanelWidth'
import { useWindowResizing } from '@/hooks/useWindowResizing'
import { PANEL_DEFAULT_WIDTH } from '@/constants/panels'
import { formatDateLong } from '@/utils/dateUtils'
import { parseEventDescription } from '@/utils/eventDescription'
import {
  enrichEvent,
  fetchEventImage,
} from '@/services/eventEnrichment'
import type { EnrichableEvent, EventSource } from '@/types/event'
import type { ByokProvider } from '@/types/ai'
import { PROVIDER_META } from '@/constants/byokProviders'
import { getKey } from '@/services/userApiKey'
import { PhotoHeader, type PanelPhoto } from './PhotoHeader'

interface EventDetailPanelProps<E extends EnrichableEvent> {
  open: boolean
  event: E | null
  timelineTitle: string
  mode: 'edit' | 'view'
  onClose: () => void
  /** Called with the same event, enriched (or cleared). */
  onEventChange: (updated: E) => void
  /**
   * A World Events entry: context, not the user's content. Nothing in the
   * panel may change it — no Edit or Delete, and no Regenerate or Remove
   * footer — but its description still generates on open, like any event's.
   */
  readOnly?: boolean
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

/** Keys that scroll a container, plus Tab — moving focus to a link near the
 *  bottom scrolls it into view, and that is the reader's doing. */
const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab',
])

/** Ragged on purpose — three equal bars read as a table, not as a list. */
const SOURCE_SKELETON_WIDTHS = ['72%', '54%', '63%']

/** Three one-line bullets, ragged for the same reason. */
const SUMMARY_SKELETON_WIDTHS = ['88%', '76%', '82%']

function formatDateRange(event: EnrichableEvent): string {
  if (event.startDate === event.endDate) return formatDateLong(event.startDate)
  return `${formatDateLong(event.startDate)} → ${formatDateLong(event.endDate)}`
}

function hasGeneratedContent(event: EnrichableEvent | null): boolean {
  return Boolean(event?.description)
}

export function EventDetailPanel<E extends EnrichableEvent>({
  open,
  event,
  timelineTitle,
  mode,
  onClose,
  onEventChange,
  onEdit,
  onDelete,
  readOnly = false,
}: EventDetailPanelProps<E>) {
  const [state, setState] = useState<PanelState>('idle')
  const [streamedDescription, setStreamedDescription] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageAttribution, setImageAttribution] = useState<string | null>(null)
  const [imageState, setImageState] = useState<ImageState>('idle')
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
  // Hold the reader at the top while content is still arriving — but only until
  // they scroll, after which the panel is theirs and nothing here touches it
  // again. Stated as a guarantee rather than a fix for one mechanism: the panel
  // has no scroll code of its own, so anything that moves it (a browser
  // heuristic, a late reflow, a focus we don't control) is something this holds
  // against without having to name it first.
  const pinnedRef = useRef(true)
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

    // A new event starts at the top, pinned again. The panel is reused across
    // events, so without this, opening one inherits both the previous event's
    // offset and the previous reader's decision to have scrolled away from it.
    pinnedRef.current = true
    if (contentRef.current) contentRef.current.scrollTop = 0

    if (hasGeneratedContent(event)) {
      // Cached content — render straight from the event.
      setState('loaded')
      setStreamedDescription(event.description ?? '')
      setImageUrl(event.imageUrl ?? null)
      setImageAttribution(event.imageAttribution ?? null)
      setSources(event.sources ?? [])
      // Nothing is being fetched. `PhotoHeader` still pulses until the <img>
      // paints — a cached URL is still bytes away.
      setImageState('settled')
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

  // The pin is released by the reader's *input*, not by the scroll position
  // moving. That distinction is the whole design: a scroll event alone cannot
  // say who caused it, and the thing being guarded against is precisely a
  // scroll nobody asked for. So intent is read from the gestures that scroll a
  // container — wheel and trackpad, touch drag, the scrollbar itself, and the
  // scroll keys once focus is inside the panel — and anything that moves the
  // offset without one of those is put back.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const release = () => {
      pinnedRef.current = false
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) release()
    }
    const handlePointerDown = (e: PointerEvent) => {
      // Only a press in the scrollbar gutter counts; a click on a button or a
      // source link is not a request to move the view. Overlay scrollbars (the
      // macOS default) leave no gutter and may not dispatch here at all, but
      // they are also invisible until something has already scrolled — and that
      // scroll was a wheel or trackpad gesture, which released the pin above.
      const offsetX = e.clientX - el.getBoundingClientRect().left
      if (offsetX >= el.clientWidth) release()
    }
    const handleScroll = () => {
      // Only while content is still arriving. Once generation is done nothing
      // grows, so there is nothing left to guard against and the panel is
      // entirely the reader's — this keeps the guard to the few seconds it is
      // actually for.
      if (state !== 'generating') return
      if (!pinnedRef.current || el.scrollTop === 0) return
      // Nobody asked for this. Put it back.
      el.scrollTop = 0
    }

    el.addEventListener('wheel', release, { passive: true })
    el.addEventListener('touchmove', release, { passive: true })
    el.addEventListener('keydown', handleKeyDown)
    el.addEventListener('pointerdown', handlePointerDown)
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', release)
      el.removeEventListener('touchmove', release)
      el.removeEventListener('keydown', handleKeyDown)
      el.removeEventListener('pointerdown', handlePointerDown)
      el.removeEventListener('scroll', handleScroll)
    }
  }, [state])

  // Re-assert the top before paint whenever something that grows has grown, so
  // a displaced position is never shown even for a frame. The scroll listener
  // above is the backstop for anything the browser adjusts after layout, which
  // is too late for this effect to see. Writing 0 over 0 is a no-op, so in the
  // ordinary case this costs a ref check and nothing else.
  useLayoutEffect(() => {
    if (!pinnedRef.current) return
    const el = contentRef.current
    if (!el || el.scrollTop === 0) return
    el.scrollTop = 0
    // The raw state rather than the `display*` values derived further down —
    // same signal, and these exist at this point in the component.
  }, [streamedDescription, imageUrl, imageAttribution, sources])

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
    currentEvent: E,
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

  const showFooter = mode === 'edit' && open && !!event && !readOnly
  // Edit and Delete used to live in the click-path actions menu. That menu is
  // gone — a click opens this panel — so the header carries them instead.
  const showAuthoringActions = mode === 'edit' && !!event && !!onEdit && !!onDelete && !readOnly
  const description = state === 'loaded' ? event?.description ?? streamedDescription : streamedDescription
  const displayImageUrl = state === 'loaded' ? event?.imageUrl ?? imageUrl : imageUrl
  const displayAttribution = state === 'loaded' ? event?.imageAttribution ?? imageAttribution : imageAttribution
  const displaySources = state === 'loaded' ? event?.sources ?? sources : sources

  const { summary, paragraphs } = parseEventDescription(description)
  const generating = state === 'generating'
  // Nothing has streamed yet: the model is still searching, and there is no
  // telling whether a summary is coming (a new edge function) or not (an old
  // one the site has outrun). Both sections hold a skeleton until the first
  // token decides it.
  const awaitingFirstToken = generating && description.length === 0
  const showSummary = summary.length > 0 || awaitingFirstToken
  // Bullets stream first, so the story skeleton sits under them until the
  // first paragraph lands.
  const showStorySkeleton = generating && paragraphs.length === 0
  const showStory = state !== 'error' && (paragraphs.length > 0 || showStorySkeleton)
  // Sources arrive on their own callback, usually before the stream finishes.
  const showSourcesSkeleton = generating && displaySources.length === 0
  const photos: PanelPhoto[] = displayImageUrl
    ? [{ url: displayImageUrl, attribution: displayAttribution }]
    : []

  return createPortal(
    <>
      {/* Backdrop — same bg-black/50 overlay TimelineSettingsPanel uses.
          Clicking dismisses the panel. */}
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
            className="flex flex-col items-stretch overflow-y-auto flex-1 min-h-0"
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

                <PhotoHeader
                  // Remount per event: resets the slide and what has loaded.
                  key={event.id}
                  photos={photos}
                  date={formatDateRange(event)}
                  title={event.title}
                  searching={imageState === 'loading'}
                  actions={
                    <>
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
                    </>
                  }
                />

                <div className="flex flex-col px-[20px] pt-[20px] pb-[24px]">
                  {state === 'error' && (
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
                  )}

                  {state !== 'error' && showSummary && (
                    <PanelSection label="Summary" first>
                      {summary.length > 0 ? (
                        <ul className="m-0 p-0 list-none flex flex-col gap-[10px]">
                          {summary.map((item, i) => (
                            <li key={i} className="flex gap-[12px] items-start">
                              <span
                                aria-hidden="true"
                                className="mt-[9px] w-[6px] h-[6px] rounded-full bg-[#9B9EA3] shrink-0"
                              />
                              <span className="body-lg text-[#ECEEF1]">{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <SkeletonText lines={3} widths={SUMMARY_SKELETON_WIDTHS} className="gap-[14px]" />
                      )}
                    </PanelSection>
                  )}

                  {showStory && (
                    <PanelSection label="The story" first={!showSummary}>
                      {paragraphs.length > 0 ? (
                        <div className="flex flex-col gap-[16px] max-w-[62ch]">
                          {paragraphs.map((para, i) => (
                            <p key={i} className="body-lg text-[#C4C7CC] m-0 whitespace-pre-wrap">
                              {para}
                            </p>
                          ))}
                        </div>
                      ) : (
                        // Two blocks rather than one run of bars: the reserved
                        // height matches the two-paragraph shape most stories
                        // come back in.
                        <div className="flex flex-col gap-[16px]">
                          <SkeletonText lines={4} />
                          <SkeletonText lines={4} />
                        </div>
                      )}
                    </PanelSection>
                  )}

                  {(showSourcesSkeleton || displaySources.length > 0) && (
                    <PanelSection
                      label="Sources"
                      first={state !== 'error' && !showSummary && !showStory}
                    >
                      <div className="flex flex-col">
                        {displaySources.length > 0
                          ? displaySources.map((source, i) => (
                              <a
                                key={`${source.url}-${i}`}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="body-m text-[#9B9EA3] underline hover:text-[#DADEE5] py-2 border-b border-[#262626] last:border-b-0 break-words"
                              >
                                {source.title || source.url}
                              </a>
                            ))
                          : SOURCE_SKELETON_WIDTHS.map((width, i) => (
                              <div
                                key={i}
                                className="flex items-center py-2 border-b border-[#262626] last:border-b-0"
                              >
                                <Skeleton className="h-[14px]" style={{ width }} />
                              </div>
                            ))}
                      </div>
                    </PanelSection>
                  )}
                </div>
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

/**
 * One of the panel's stacked sections — Summary, The story, Sources. Each
 * after the first is set off by a hairline; `first` is computed by the caller
 * because which section leads depends on what this description contains (an
 * old one has no summary).
 */
function PanelSection({
  label,
  first,
  children,
}: {
  label: string
  first?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={label}
      className={`flex flex-col gap-[12px] ${first ? '' : 'mt-[24px] pt-[24px] border-t border-[#262626]'}`}
    >
      <h3 className="label-s-type1 uppercase tracking-[0.08em] text-[#9B9EA3] m-0">{label}</h3>
      {children}
    </section>
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
