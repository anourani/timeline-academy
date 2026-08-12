import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ConfirmationModal } from '../Modal/ConfirmationModal'
import { PanelResizeHandle } from '../ui/PanelResizeHandle'
import { usePanelWidth } from '@/hooks/usePanelWidth'
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
}

type PanelState = 'idle' | 'generating' | 'loaded' | 'error'

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
}: EventDetailPanelProps) {
  const [state, setState] = useState<PanelState>('idle')
  const [streamedDescription, setStreamedDescription] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageAttribution, setImageAttribution] = useState<string | null>(null)
  const [sources, setSources] = useState<EventSource[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [errorProvider, setErrorProvider] = useState<ByokProvider | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
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

    if (hasGeneratedContent(event)) {
      // Cached content — render straight from the event.
      setState('loaded')
      setStreamedDescription(event.description ?? '')
      setImageUrl(event.imageUrl ?? null)
      setImageAttribution(event.imageAttribution ?? null)
      setSources(event.sources ?? [])
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
      if (showRemoveConfirm || showRegenerateConfirm) return
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
  }, [open, onClose, showRemoveConfirm, showRegenerateConfirm])

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
      fetchEventImage(currentEvent.title)
        .then((res) => {
          if (ctrl.signal.aborted) return
          nextImageUrl = res.imageUrl
          nextImageAttribution = res.attribution
          setImageUrl(res.imageUrl)
          setImageAttribution(res.attribution)
        })
        .catch(() => {
          // Already returns null/null on errors — nothing to do.
        })
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
  const description = state === 'loaded' ? event?.description ?? streamedDescription : streamedDescription
  const displayImageUrl = state === 'loaded' ? event?.imageUrl ?? imageUrl : imageUrl
  const displayAttribution = state === 'loaded' ? event?.imageAttribution ?? imageAttribution : imageAttribution
  const displaySources = state === 'loaded' ? event?.sources ?? sources : sources

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
          isResizing ? '' : 'transition-[transform,width] duration-300 ease-out'
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
          <div className="flex flex-col items-stretch p-[24px_20px] gap-[16px] overflow-y-auto flex-1 min-h-0">
            {event && (
              <>
                {/* Date row + mobile close */}
                <div className="flex items-center justify-between">
                  <p className="label-s-type1 text-[#9B9EA3] m-0">
                    {formatDateRange(event)}
                  </p>
                  <button
                    onClick={onClose}
                    className="md:hidden flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors"
                    aria-label="Close panel"
                  >
                    <X size={16} strokeWidth={1.25} />
                  </button>
                </div>

                {/* Photo frame. Fluid rather than a fixed 274px so it follows
                    a resized panel; the 274/205 ratio is preserved. */}
                <div
                  className={`w-full aspect-[274/205] bg-[#0A0A0A] border border-[#525252] rounded-[8px] overflow-hidden ${
                    state === 'generating' && !displayImageUrl ? 'animate-pulse' : ''
                  }`}
                >
                  {displayImageUrl && (
                    <img
                      src={displayImageUrl}
                      alt={event.title}
                      // Never send the page URL (a /view share link is the
                      // access capability itself) to the image host.
                      referrerPolicy="no-referrer"
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
