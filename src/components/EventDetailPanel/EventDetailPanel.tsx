import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ConfirmationModal } from '../Modal/ConfirmationModal'
import { formatDateLong } from '@/utils/dateUtils'
import { useAuth } from '@/hooks/useAuth'
import {
  enrichEvent,
  fetchEventImage,
} from '@/services/eventEnrichment'
import type { EventSource, TimelineEvent } from '@/types/event'

interface EventDetailPanelProps {
  open: boolean
  event: TimelineEvent | null
  timelineTitle: string
  mode: 'edit' | 'view'
  onClose: () => void
  onEventChange: (updated: TimelineEvent) => void
  /** Optional: trigger the sign-in modal from the panel's logged-out state. */
  onRequestSignIn?: () => void
}

type PanelState = 'idle' | 'generating' | 'loaded' | 'error' | 'signin-required'

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
  onRequestSignIn,
}: EventDetailPanelProps) {
  const { user } = useAuth()
  const [state, setState] = useState<PanelState>('idle')
  const [streamedDescription, setStreamedDescription] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageAttribution, setImageAttribution] = useState<string | null>(null)
  const [sources, setSources] = useState<EventSource[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
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

    // Fresh event — only auto-generate in edit mode (view-mode click on an
    // empty event is supposed to be a no-op upstream, but guard anyway).
    if (mode !== 'edit') {
      setState('idle')
      return
    }

    // Generation requires a signed-in user (the edge function rejects
    // anonymous calls). Surface a friendly sign-in prompt instead of running
    // the request just to show an auth error.
    if (!user) {
      setState('signin-required')
      setStreamedDescription('')
      setImageUrl(null)
      setImageAttribution(null)
      setSources([])
      setErrorMessage('')
      return
    }

    setState('generating')
    setStreamedDescription('')
    setImageUrl(null)
    setImageAttribution(null)
    setSources([])
    setErrorMessage('')

    runGeneration(event, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, user])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  // Escape closes the panel. Click outside the panel also closes it (desktop
  // has no visible backdrop so the timeline behind stays visible, but a click
  // anywhere off-panel should still dismiss the way Cancel would). Suppress
  // outside-click while the destructive Remove confirmation modal is open so
  // clicking the modal's overlay doesn't also dismiss the panel.
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (showRemoveConfirm) return
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
  }, [open, onClose, showRemoveConfirm])

  function runGeneration(currentEvent: TimelineEvent, preserveImage: boolean) {
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
        onError: (message) => {
          if (ctrl.signal.aborted) return
          setErrorMessage(message)
          setState('error')
        },
      },
      ctrl.signal,
    )
  }

  function handleRegenerate() {
    if (!event) return
    // Preserve image only if we already have one.
    runGeneration(event, !!imageUrl)
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
      {/* Mobile-only backdrop */}
      <div
        onClick={onClose}
        className={`md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      <aside
        ref={panelRef}
        className={`fixed inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[326px] md:pr-[6px] md:py-[6px] z-50 transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
        aria-label="Event details"
      >
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

                {/* Photo frame */}
                <div
                  className={`w-full md:w-[274px] aspect-[274/205] bg-[#0A0A0A] border border-[#525252] rounded-[8px] overflow-hidden ${
                    state === 'generating' && !displayImageUrl ? 'animate-pulse' : ''
                  }`}
                >
                  {displayImageUrl && (
                    <img
                      src={displayImageUrl}
                      alt={event.title}
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
                {state === 'signin-required' ? (
                  <div className="flex flex-col gap-2">
                    <p className="body-m text-[#9B9EA3] m-0">
                      Sign in to generate AI-powered details for this event.
                    </p>
                    {onRequestSignIn && (
                      <button
                        onClick={onRequestSignIn}
                        className="self-start font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#DADEE5] underline hover:text-white"
                      >
                        Sign in
                      </button>
                    )}
                  </div>
                ) : state === 'error' ? (
                  <div className="flex flex-col gap-2">
                    <p className="body-m text-[#9B9EA3] m-0">
                      Couldn't generate details. {errorMessage ? `(${errorMessage})` : ''}
                    </p>
                    <button
                      onClick={handleRegenerate}
                      className="self-start font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#DADEE5] underline hover:text-white"
                    >
                      Try again
                    </button>
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
