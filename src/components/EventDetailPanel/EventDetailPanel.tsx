import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, X } from 'lucide-react'
import { ConfirmationModal } from '../Modal/ConfirmationModal'
import { Skeleton, SkeletonText } from '../ui/skeleton'
import { parseEventDescription } from '@/utils/eventDescription'
import { formatEventWhen } from '@/utils/eventWhen'
import {
  enrichEvent,
  fetchEventImage,
} from '@/services/eventEnrichment'
import type { CategoryConfig, EnrichableEvent, EventPhoto, EventSource } from '@/types/event'
import type { TimelineChapter } from '@/types/timeline'
import type { ByokProvider } from '@/types/ai'
import { PROVIDER_META } from '@/constants/byokProviders'
import { getKey } from '@/services/userApiKey'
import { PhotoViewer } from './PhotoViewer'
import { AtAGlance, type GlanceRow } from './AtAGlance'
import { focusEventBar, useEventMorph } from './useEventMorph'
import { fetchEventPhotos } from '@/services/wikipediaPhotos'
import {
  clearCachedEventPhotos,
  getCachedEventPhotos,
  setCachedEventPhotos,
} from '@/services/eventPhotoCache'

// The event view: clicking an event opens it as a full page, grown out of the
// bar that was clicked (docs/2026-11-24-event-view-prd.md). It replaced a
// 352px right-hand panel, and kept that panel's whole behaviour — generation
// on open, streaming, the scroll pin, persistence, Regenerate / Remove,
// Edit / Delete — under a new layout and a new way in and out.
//
// The component name and props are the panel's, so both mount points (the
// editor and the shared viewer) changed only by passing categories and
// chapters for the chips.

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
   * view may change it — no Edit or Delete, and no Regenerate or Remove —
   * but its description still generates on open, like any event's.
   */
  readOnly?: boolean
  /** Edit-mode authoring actions, shown in the top bar. Omitted in view mode. */
  onEdit?: () => void
  onDelete?: () => void
  /** For the category chip and colour. World Events entries have no category. */
  categories?: CategoryConfig[]
  /** For the chapter chip, on timelines that have chapters. */
  chapters?: TimelineChapter[]
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

/** Neutral grey for entries with no category (World Events). */
const NO_CATEGORY_COLOR = '#9B9EA3'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

function hasGeneratedContent(event: EnrichableEvent | null): boolean {
  return Boolean(event?.description)
}

/** The chapter whose months contain the event's start, compared as `YYYY-MM`. */
function chapterFor(
  chapters: TimelineChapter[] | undefined,
  startDate: string,
): TimelineChapter | null {
  if (!chapters?.length || !startDate) return null
  const month = startDate.slice(0, 7)
  return (
    chapters.find((c) => c.startDate.slice(0, 7) <= month && month <= c.endDate.slice(0, 7)) ??
    null
  )
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
  categories,
  chapters,
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
  const contentRef = useRef<HTMLDivElement | null>(null)
  // Hold the reader at the top while content is still arriving — but only until
  // they scroll, after which the page is theirs and nothing here touches it
  // again. Stated as a guarantee rather than a fix for one mechanism: the page
  // has no scroll code of its own, so anything that moves it (a browser
  // heuristic, a late reflow, a focus we don't control) is something this holds
  // against without having to name it first.
  const pinnedRef = useRef(true)

  // ---- Open / close lifecycle -------------------------------------------
  //
  // The parent clears `event` the moment it closes the view, but the page has
  // to stay on screen — showing that event — while it shrinks back into the
  // bar. `present` keeps the layer mounted until the close animation ends, and
  // `retainedRef` keeps the event it was showing.
  const layerRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const shownIdRef = useRef<string | null>(null)
  const retainedRef = useRef<E | null>(null)
  const [present, setPresent] = useState(false)
  const morph = useEventMorph(layerRef)
  const titleId = useId()

  if (event) retainedRef.current = event
  const view: E | null = event ?? (present ? retainedRef.current : null)
  const visible = (open && !!event) || present

  // Before paint, so the layer is never seen at full size before it starts as
  // the bar.
  useLayoutEffect(() => {
    if (open && event) {
      if (shownIdRef.current === event.id) return
      shownIdRef.current = event.id
      setPresent(true)
      morph.open(event.id)
      // Usable at once, not when the animation ends.
      closeButtonRef.current?.focus({ preventScroll: true })
      return
    }
    if (!open && shownIdRef.current) {
      const id = shownIdRef.current
      shownIdRef.current = null
      morph.close(id).then(() => {
        // Reopened while closing: that open owns the layer now.
        if (shownIdRef.current) return
        setPresent(false)
        focusEventBar(id)
      })
    }
    // `morph` is stable; keyed on the event's identity, not its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id])

  // The gallery: several photos from the event's Wikipedia article, cached in
  // the browser. Independent of the description — it runs for cached events
  // too, and Regenerate leaves it alone. `null` while it is being looked up.
  const [gallery, setGallery] = useState<EventPhoto[] | null>(null)
  useEffect(() => {
    if (!open || !event) return
    const cached = getCachedEventPhotos(event.id, event.title)
    if (cached) {
      setGallery(cached)
      return
    }
    setGallery(null)
    let cancelled = false
    const { id, title } = event
    fetchEventPhotos(title).then((photos) => {
      if (cancelled) return
      setCachedEventPhotos(id, title, photos)
      setGallery(photos)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, event?.title])

  // Reset state when the view closes or the event changes.
  useEffect(() => {
    if (!open || !event) {
      // Cleanup any in-flight stream when the view closes.
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      return
    }

    // A new event starts at the top, pinned again. The view is reused across
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
      // Nothing is being fetched. `PhotoViewer` still pulses until the <img>
      // paints — a cached URL is still bytes away.
      setImageState('settled')
      return
    }

    // Fresh event — auto-generation runs in either edit or view/present mode.
    // Routing (BYOK key vs session token vs JWT) is handled inside enrichEvent;
    // the view just kicks off generation. It starts with the open animation,
    // not after it: skeletons settle into the page as it grows.
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
  // scroll keys once focus is inside the view — and anything that moves the
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
      // source link is not a request to move the view.
      const offsetX = e.clientX - el.getBoundingClientRect().left
      if (offsetX >= el.clientWidth) release()
    }
    const handleScroll = () => {
      // Only while content is still arriving. Once generation is done nothing
      // grows, so there is nothing left to guard against.
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
    // `visible`: the scroll container only exists while the view is up.
  }, [state, visible])

  // Below `lg` the top bar sits over the photo as a light scrim. Once the photo
  // has scrolled away the bar turns solid, or text would show through it.
  const [pastPhoto, setPastPhoto] = useState(false)
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const update = () => setPastPhoto(el.scrollTop > 220)
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [visible])

  // Re-assert the top before paint whenever something that grows has grown, so
  // a displaced position is never shown even for a frame.
  useLayoutEffect(() => {
    if (!pinnedRef.current) return
    const el = contentRef.current
    if (!el || el.scrollTop === 0) return
    el.scrollTop = 0
  }, [streamedDescription, imageUrl, imageAttribution, sources])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  // Escape closes the view — unless a confirmation is open, which Escape
  // closes instead. There is no click-outside: nothing is outside a full page.
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showRemoveConfirm || showRegenerateConfirm || showDeleteConfirm) return
      onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose, showRemoveConfirm, showRegenerateConfirm, showDeleteConfirm])

  // A confirmation left open when the view closes would reappear over the next
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
    clearCachedEventPhotos(event.id)
    onEventChange({
      ...event,
      description: null,
      imageUrl: null,
      imageAttribution: null,
      sources: null,
    })
    onClose()
  }

  if (typeof document === 'undefined' || !visible || !view) return null

  const showFooter = mode === 'edit' && open && !readOnly
  // Edit and Delete used to live in the click-path actions menu. That menu is
  // gone — a click opens this view — so the top bar carries them instead.
  const showAuthoringActions = mode === 'edit' && !!onEdit && !!onDelete && !readOnly
  const description = state === 'loaded' ? view.description ?? streamedDescription : streamedDescription
  const displayImageUrl = state === 'loaded' ? view.imageUrl ?? imageUrl : imageUrl
  const displayAttribution = state === 'loaded' ? view.imageAttribution ?? imageAttribution : imageAttribution
  const displaySources = state === 'loaded' ? view.sources ?? sources : sources

  const { summary, paragraphs, facts } = parseEventDescription(description)
  // The model's At a glance rows, in a fixed order. They stream last, so while
  // generating with none yet, one skeleton row holds their place.
  const factRows: GlanceRow[] = [
    facts.where ? { label: 'Where', value: facts.where } : null,
    facts.who ? { label: 'Who', value: facts.who } : null,
    facts.age ? { label: 'Age', value: facts.age } : null,
  ].filter((row): row is GlanceRow => row !== null)
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
  // The gallery when it has anything (its first photo is the article's lead
  // image, at full size); until then, or when it finds nothing usable, the
  // single persisted lead image.
  const lead: EventPhoto | null = displayImageUrl
    ? { url: displayImageUrl, attribution: displayAttribution }
    : null
  const photos: EventPhoto[] = gallery?.length ? gallery : lead ? [lead] : []
  // Only worth a pulsing frame while there is nothing to show yet and a lookup
  // is still out. `idle` is the first frame of a fresh event, before the
  // lead-image lookup has started.
  const searchingPhotos = photos.length === 0 && (imageState !== 'settled' || gallery === null)
  const hasPhotoArea = photos.length > 0 || searchingPhotos

  const categoryId = (view as { category?: string }).category
  const category = categoryId ? categories?.find((c) => c.id === categoryId) ?? null : null
  const isWorldEvent = 'source' in view
  const accent = category?.color ?? NO_CATEGORY_COLOR
  const chapter = chapterFor(chapters, view.startDate)
  const when = formatEventWhen(view.startDate, view.endDate)

  /** Keep Tab inside the page: the editor behind it is inert. */
  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !layerRef.current) return
    const focusables = Array.from(layerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <>
      <div
        ref={layerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
        // Above the side panel and the dock (z-40).
        className="fixed inset-0 z-50 bg-[#0B0B0B]"
      >
        {/* The skeletons are `aria-hidden`, so this is the only thing telling a
            screen reader that the view is mid-generation. `polite` — it must
            not interrupt whatever is being read. */}
        <p className="sr-only" role="status" aria-live="polite">
          {state === 'generating'
            ? 'Generating event details'
            : state === 'loaded'
              ? 'Event details ready'
              : ''}
        </p>

        {/* Scroll anchoring is left at the browser default: where it acts — a
            late image growing above the reader — it holds them on the same
            sentence, which is what a reader wants. */}
        <div
          ref={contentRef}
          aria-busy={state === 'generating'}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden"
        >
          {/* Top bar. Sticky on a strip of the page colour, so the page scrolls
              under it; over a photo (below `lg`) the strip is a light scrim. */}
          <div
            data-morph-stage="header"
            className={`sticky top-0 z-10 flex items-center justify-between gap-3 h-[64px] lg:h-[72px] px-[12px] lg:px-[24px] bg-gradient-to-b ${
              hasPhotoArea && !pastPhoto
                ? 'from-black/55 to-transparent lg:from-[#0B0B0B] lg:via-[#0B0B0B]/90'
                : 'from-[#0B0B0B] via-[#0B0B0B]/90 to-transparent'
            }`}
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close event"
              className="flex items-center gap-[8px] h-[44px] lg:h-[40px] min-w-[44px] justify-center lg:justify-start px-[10px] lg:pl-[10px] lg:pr-[12px] rounded-[10px] border border-white/15 bg-black/40 lg:bg-[#111111] text-[#ECEEF1] hover:bg-white/10 transition-colors"
            >
              <X size={18} strokeWidth={1.5} />
              <span className="hidden lg:inline font-['Avenir',sans-serif] text-[14px]">Close</span>
              <kbd className="hidden lg:inline label-xs-type1 text-[#9B9EA3] border border-white/20 rounded-[4px] px-[5px] py-[1px]">
                esc
              </kbd>
            </button>
            {showAuthoringActions && (
              <div className="flex items-center gap-2">
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
              </div>
            )}
          </div>

          {/* The page. Two columns from `lg` (title, At a glance, summary |
              photos, story, sources); one below it, where `contents` lets the
              two column wrappers dissolve so `order` can interleave them:
              photos, title, At a glance, summary, story, sources. */}
          <div
            className={`flex flex-col w-full mx-auto pb-[64px] lg:px-[48px] ${
              hasPhotoArea
                ? '-mt-[64px] lg:mt-0 lg:flex-row lg:items-start lg:gap-[64px] max-w-[1296px]'
                : 'max-w-[816px]'
            }`}
          >
            <div className={hasPhotoArea ? 'contents lg:flex lg:flex-col lg:flex-1 lg:min-w-0 lg:max-w-[520px]' : 'contents'}>
              <header data-morph-stage="header" className="order-2 px-[20px] lg:px-0 pt-[20px] lg:pt-[8px]">
                <div className="flex flex-wrap items-center gap-[8px]">
                  {(category || isWorldEvent) && (
                    <span
                      className="inline-flex items-center gap-[7px] h-[26px] px-[10px] rounded-full border font-['Avenir',sans-serif] text-[12px] text-[#ECEEF1]"
                      style={{ backgroundColor: `${accent}1F`, borderColor: `${accent}66` }}
                    >
                      <span aria-hidden="true" className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: accent }} />
                      {category?.label ?? 'World events'}
                    </span>
                  )}
                  {chapter && (
                    <span className="inline-flex items-center h-[26px] px-[10px] rounded-full border border-[#333333] font-['Avenir',sans-serif] text-[12px] text-[#C4C7CC]">
                      {chapter.label}
                    </span>
                  )}
                </div>
                <h1
                  id={titleId}
                  className="m-0 mt-[14px] font-['Aleo',serif] font-medium text-[#ECEEF1] text-[32px] leading-[1.12] lg:text-[46px] lg:leading-[1.08] tracking-[-0.01em]"
                >
                  {view.title}
                </h1>
              </header>

              <div data-morph-stage="content" className="order-3 px-[20px] lg:px-0 mt-[24px] lg:mt-[30px]">
                <AtAGlance when={when} rows={factRows} pending={generating} />
              </div>

              <div data-morph-stage="content" className="order-4 px-[20px] lg:px-0 mt-[36px]">
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
                  <PageSection label="Summary">
                    {summary.length > 0 ? (
                      <ul className="m-0 p-0 list-none flex flex-col gap-[14px]">
                        {summary.map((item, i) => (
                          <li key={i} className="flex gap-[12px] items-start">
                            <span
                              aria-hidden="true"
                              className="mt-[10px] w-[6px] h-[6px] rounded-full shrink-0"
                              style={{ backgroundColor: accent }}
                            />
                            <span className="font-['Aleo',serif] text-[18px] lg:text-[19px] leading-[1.4] text-[#ECEEF1]">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <SkeletonText lines={3} widths={SUMMARY_SKELETON_WIDTHS} className="gap-[14px]" />
                    )}
                  </PageSection>
                )}
              </div>
            </div>

            <div className={hasPhotoArea ? 'contents lg:flex lg:flex-col lg:w-[640px] lg:shrink-0' : 'contents'}>
              <div data-morph-stage="photo" className="order-1">
                <PhotoViewer
                  // Remount per event: resets the index and what has loaded.
                  key={view.id}
                  photos={photos}
                  title={view.title}
                  searching={searchingPhotos}
                  accent={accent}
                />
              </div>

              <div data-morph-stage="content" className="order-5 px-[20px] lg:px-0 mt-[36px] lg:mt-[40px]">
                {showStory && (
                  <PageSection label="The story">
                    {paragraphs.length > 0 ? (
                      <div className="flex flex-col gap-[16px] max-w-[62ch]">
                        {paragraphs.map((para, i) => (
                          <StoryParagraph key={i} text={para} accent={accent} />
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
                  </PageSection>
                )}

                {(showSourcesSkeleton || displaySources.length > 0) && (
                  <div className={showStory ? 'mt-[36px]' : ''}>
                    <PageSection label="Sources">
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
                    </PageSection>
                  </div>
                )}

                {showFooter && (
                  <div className="mt-[40px] flex gap-[10px] max-w-[360px]">
                    <FooterButton onClick={handleRegenerate} disabled={state === 'generating'}>
                      Regenerate
                    </FooterButton>
                    <FooterButton onClick={() => setShowRemoveConfirm(true)} disabled={state === 'generating'}>
                      Remove
                    </FooterButton>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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
        message={`"${view.title}" will be removed from the timeline. This cannot be undone.`}
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

/** A line the model started with a list marker. */
const STORY_BULLET = /^\s*[-*•]\s+/

/**
 * One paragraph of the story. The prompt asks for plain paragraphs, but when a
 * model slips into a list anyway, its "- " lines are drawn as real bullets
 * (the Summary's dots) rather than shown as typed dashes.
 */
function StoryParagraph({ text, accent }: { text: string; accent: string }) {
  const textClass =
    "font-['Avenir',sans-serif] text-[16px] lg:text-[17px] leading-[1.7] text-[#C4C7CC]"
  const lines = text.split('\n')
  if (!lines.some((line) => STORY_BULLET.test(line))) {
    return <p className={`m-0 whitespace-pre-wrap ${textClass}`}>{text}</p>
  }

  // Runs of marker lines become lists; anything between them stays a paragraph.
  const blocks: { list: boolean; lines: string[] }[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    const list = STORY_BULLET.test(line)
    const last = blocks[blocks.length - 1]
    const content = list ? line.replace(STORY_BULLET, '') : line
    if (last && last.list === list) last.lines.push(content)
    else blocks.push({ list, lines: [content] })
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {blocks.map((block, i) =>
        block.list ? (
          <ul key={i} className="m-0 p-0 list-none flex flex-col gap-[10px]">
            {block.lines.map((item, j) => (
              <li key={j} className="flex gap-[12px] items-start">
                <span
                  aria-hidden="true"
                  className="mt-[11px] w-[6px] h-[6px] rounded-full shrink-0"
                  style={{ backgroundColor: accent }}
                />
                <span className={textClass}>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className={`m-0 whitespace-pre-wrap ${textClass}`}>
            {block.lines.join('\n')}
          </p>
        ),
      )}
    </div>
  )
}

/** One of the page's sections — Summary, The story, Sources. */
function PageSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-[14px]">
      <h2 className="label-s-type1 uppercase tracking-[0.08em] text-[#9B9EA3] m-0">{label}</h2>
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
      className={`flex items-center justify-center w-[44px] h-[44px] lg:w-[40px] lg:h-[40px] rounded-[10px] border border-white/15 bg-black/40 lg:bg-[#111111] hover:bg-white/10 transition-colors ${
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
      className="flex-1 flex items-center justify-center h-[36px] px-[10px] py-[5px] rounded-[10px] border border-white/[0.15] bg-white/10 font-['Avenir',sans-serif] font-medium text-[14px] leading-[150%] text-[#C9CED4] hover:bg-white/20 hover:text-[#dadee5] transition-colors disabled:opacity-50 disabled:pointer-events-none"
    >
      {children}
    </button>
  )
}
