import { useState, useEffect, useRef } from 'react'
import { ArrowUp } from 'lucide-react'
import {
  SubjectSuggestions,
  SUGGESTIONS_LISTBOX_ID,
  SUGGESTION_OPTION_ID_PREFIX,
} from '@/components/AIMode/SubjectSuggestions'
import { useSubjectSuggestions } from '@/hooks/useSubjectSuggestions'
import {
  MIN_SUGGESTION_QUERY_LENGTH,
  pickMoments,
} from '@/constants/aiSubjectSuggestions'
import { QuickSearchMoments } from '@/components/NewTimeline/QuickSearchMoments'
import { ModelSelector } from '@/components/Settings/ModelSelector'
import { PROVIDER_META } from '@/constants/byokProviders'
import type { ByokProvider } from '@/types/ai'

interface NewTimelineScreenProps {
  /**
   * `fromRect` is the search composer's on-screen box, measured before the
   * navigation it triggers. The editor's intro animation flies the typed
   * query from here into the nav title, and once we have navigated this
   * element is gone — so it has to be read on the way out.
   */
  onAIGenerate: (subject: string, fromRect: DOMRect | null) => void
  /** Seeds the field once, at mount. Empty on an ordinary visit. */
  initialSubject?: string
  error: string | null
  /** Set when the failure came from one BYOK provider and the user has a key
   *  for the other one. Null otherwise — including on the server-funded path,
   *  which has no alternative to offer. */
  retryProvider?: ByokProvider | null
  onRetryWithProvider?: (provider: ByokProvider) => void
  /** Opens the key modal from the model dropdown's unlock row. The page owns
   *  that modal, because it is the same one the Generate gate opens. */
  onRequestApiKey: () => void
}

/**
 * The responsive page gutter, shared with `CurtainIntro`.
 *
 * `BackgroundGrid` anchors its first column line to `--page-gutter`, so the
 * intro has to declare the identical scale or the lines it animates start a
 * few dozen pixels off from where this screen drew them — visible as a jump
 * on the first frame at every width except the one it was tuned at.
 */
export const PAGE_GUTTER_SCALE =
  '[--page-gutter:16px] sm:[--page-gutter:40px] md:[--page-gutter:64px] lg:[--page-gutter:120px]'

/**
 * Exported for `CurtainIntro`, which replays this screen's exit inside the
 * editor. Frame 0 of the intro has to match the last frame here exactly, so
 * both sides render the same component rather than two copies that drift.
 *
 * The 200px column spacing and the `--page-gutter` origin are the contract:
 * the intro re-renders these lines as individual divs so each can move on its
 * own, and it derives their positions from the same two numbers.
 */
export const GRID_COLUMN_SPACING = 200

export function BackgroundGrid() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute top-0 bottom-0"
        style={{
          // Tracks the page gutter declared on this screen's root, so the
          // first column line always lands on the content's left edge.
          left: 'var(--page-gutter)',
          right: '0',
          backgroundImage:
            'repeating-linear-gradient(to right, rgba(210,210,210,0.1) 0 1px, transparent 1px 200px)',
        }}
      />
    </div>
  )
}

export function BackgroundPattern() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 878,
          height: 879,
          left: '-567px',
          top: '77px',
          background: 'rgba(143, 146, 252, 0.08)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 837,
          height: 839,
          left: '1004px',
          top: '-93px',
          background: 'rgba(37, 158, 35, 0.06)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 911,
          height: 911,
          left: '259px',
          top: '158px',
          background: 'rgba(65, 150, 228, 0.06)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 405,
          height: 405,
          left: '274px',
          top: '-205px',
          background: 'rgba(120, 44, 0, 0.09)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 375,
          height: 375,
          left: '875px',
          top: '-28px',
          background: 'rgba(100, 0, 120, 0.04)',
          filter: 'blur(100px)',
        }}
      />
    </div>
  )
}

export function NewTimelineScreen({
  onAIGenerate,
  initialSubject = '',
  error,
  retryProvider,
  onRetryWithProvider,
  onRequestApiKey,
}: NewTimelineScreenProps) {
  // Mount-time only, which is the right shape: the page mounts fresh each
  // time the editor sends someone back to it, and a later change to the prop
  // must never overwrite what they have typed since.
  const [name, setName] = useState(initialSubject)
  // The subject the user picked from the list. Set when a suggestion is
  // chosen, cleared by any edit that no longer equals it. A restored subject
  // counts as picked: it is one they already generated.
  const [selectedSubject, setSelectedSubject] = useState<string | null>(initialSubject || null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [renderDropdown, setRenderDropdown] = useState(false)
  // Drawn once per mount, so the moments rotate between visits but never move
  // under a cursor that is already reaching for one. Shuffle is the only other
  // way they change, and that is the user asking them to.
  const [moments, setMoments] = useState(() => pickMoments())
  const inputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const { suggestions, isLoading: suggestionsLoading } = useSubjectSuggestions(name)

  useEffect(() => {
    setHighlight(0)
  }, [name])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setShowSuggestions(false)
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [showSuggestions])

  // Only a known subject generates. A partial query like "K" is a search in
  // progress, not a request, so it opens the list instead of spending a
  // generation on whatever the model makes of one letter.
  const trimmed = name.trim()
  const exactMatch = suggestions.find(
    (s) => s.title.toLowerCase() === trimmed.toLowerCase(),
  )
  const isValidSubject =
    (selectedSubject !== null && selectedSubject === trimmed) || Boolean(exactMatch)

  // The composer is what the editor's intro replays, so it is what we measure.
  const measureComposer = () => composerRef.current?.getBoundingClientRect() ?? null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidSubject) {
      setShowSuggestions(true)
      return
    }
    setShowSuggestions(false)
    // The canonical title's casing, so "marie curie" generates "Marie Curie".
    onAIGenerate(exactMatch?.title ?? trimmed, measureComposer())
  }

  const handleSelectSuggestion = (title: string) => {
    setName(title)
    setSelectedSubject(title)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const shuffleMoments = () => setMoments((prev) => pickMoments(prev))

  // Moments skip the known-subject gate: they are curated, so already known.
  const handleQuickSearch = (subject: string) => {
    // Seed the field before generating: for a signed-out visitor
    // `onAIGenerate` opens the key/sign-in gate, which should show what they
    // asked for rather than an empty box.
    setName(subject)
    setSelectedSubject(subject)
    setShowSuggestions(false)
    onAIGenerate(subject, measureComposer())
  }

  // The length test is not redundant with the hook's: that effect runs *after*
  // render, so on the render where the query drops back to one character
  // `suggestions` still holds the previous six. Without it, backspacing flashes
  // stale rows on the way down.
  const dropdownVisible =
    showSuggestions &&
    name.trim().length >= MIN_SUGGESTION_QUERY_LENGTH &&
    (suggestions.length > 0 || suggestionsLoading)

  const activeDescendant =
    dropdownVisible && !suggestionsLoading && suggestions.length > 0
      ? `${SUGGESTION_OPTION_ID_PREFIX}${highlight}`
      : undefined

  useEffect(() => {
    if (dropdownVisible) {
      setRenderDropdown(true)
      return
    }
    if (!renderDropdown) return
    const t = setTimeout(() => setRenderDropdown(false), 180)
    return () => clearTimeout(t)
  }, [dropdownVisible, renderDropdown])

  return (
    <div className={`relative h-screen overflow-hidden bg-surface-primary ${PAGE_GUTTER_SCALE}`}>
      <BackgroundGrid />
      <BackgroundPattern />
      <div className="relative z-10 h-full">
        {/* The screen is exactly one viewport tall and never scrolls, so the
            form is centred in the space left below the nav rather than pushed
            down by a fixed offset. `pt-[80px]` is the height of the
            `GlobalNav` that `AIModePage` paints over this screen: reserving it
            here is what makes the centring measure the *clear* area rather
            than the whole viewport, so the heading can never tuck under the nav.

            This replaced a `pt-[max(40vh,200px)]` offset that put the label at
            40% of the viewport and let the page scroll when the sum overran.
            With `overflow-hidden` a fixed offset has nowhere to put content
            that no longer fits, so a short window would clip the quick
            searches off the bottom instead of scrolling to them. Centred, the
            block gives back its own slack from both ends and stays whole. */}
        <div className="h-full flex flex-col items-center justify-center gap-[40px] px-[var(--page-gutter)] pt-[80px] pb-[40px]">
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="w-full flex flex-col items-center gap-[24px] md:gap-[28px]"
          >
            {/* Written out rather than `header-small md:header-medium`:
                stacking those two leaves the winner to source order between
                equal-specificity utilities in the same layer. */}
            <h2 className="m-0 text-center text-text-primary [text-wrap:balance] font-['Aleo',serif] font-normal tracking-[-0.01em] text-[24px] leading-[1.4] md:text-[32px] md:leading-[1.25]">
              What should we put on a timeline?
            </h2>

            {/* One column, so the quick searches and any error hang off the
                composer's left edge. */}
            <div className="w-full max-w-[640px] flex flex-col items-start gap-[12px]">
              {/* The positioning context for the suggestions panel, which
                  hangs 6px below the composer and covers the quick searches. */}
              <div className="relative w-full">
                <div
                  ref={composerRef}
                  className={`flex flex-col gap-[16px] md:gap-[20px] rounded-[20px] border bg-surface-secondary shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-colors duration-150 pt-[16px] pr-[8px] pb-[8px] pl-[16px] md:pt-[18px] md:pr-[12px] md:pb-[12px] md:pl-[20px] ${
                    renderDropdown
                      ? 'border-[#404040]'
                      : 'border-[#262626] has-[input:focus]:border-[#404040]'
                  }`}
                >
                  {/* 16px is the floor below `md`: iOS zooms the page into any
                      focused input set smaller. */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => {
                      const v = e.target.value
                      setName(v)
                      setShowSuggestions(true)
                      if (v.trim() !== selectedSubject) setSelectedSubject(null)
                    }}
                    placeholder="Search for a person, era, or event"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={dropdownVisible}
                    aria-controls={SUGGESTIONS_LISTBOX_ID}
                    aria-activedescendant={activeDescendant}
                    aria-label="Search for a person, era, or event"
                    className="w-full min-w-0 bg-transparent border-0 outline-none pr-[8px] text-ellipsis font-['Avenir',sans-serif] text-[16px] leading-[24px] md:text-[18px] md:leading-[28px] text-text-primary placeholder:text-text-tertiary"
                  />

                  <div className="flex items-center justify-between gap-[8px]">
                    <ModelSelector
                      variant="pill"
                      onRequestApiKey={onRequestApiKey}
                    />

                    {/* `type="submit"` is the whole point: the Enter key and
                        this button reach `handleSubmit` through one path — the
                        form's default button — rather than two copies of it
                        that could drift.

                        Which is also why it must never be `disabled`. A
                        disabled default button has no activation behaviour, so
                        implicit submission fires nothing and the Enter key dies
                        with it. An unknown subject is refused inside
                        `handleSubmit` instead, and `aria-disabled` carries the
                        state to assistive tech without changing the Enter path. */}
                    <button
                      type="submit"
                      aria-label="Generate timeline"
                      aria-disabled={!isValidSubject}
                      className={`shrink-0 size-[44px] md:size-[36px] rounded-full flex items-center justify-center transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
                        isValidSubject
                          ? 'bg-[rgba(37,99,235,0.8)] hover:bg-[rgba(37,99,235,0.9)] text-[#DADEE5]'
                          : 'bg-[#262626] text-[#6D7073] cursor-not-allowed'
                      }`}
                    >
                      <ArrowUp
                        strokeWidth={2}
                        className="size-[20px] md:size-[18px]"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>

                {renderDropdown && (
                  /* The backdrop blur belongs to the panel's design but has
                     to be applied here, on the wrapper, and the reason is
                     worth keeping: `animate-in` runs a keyframe that sets a
                     transform, `fill-mode-forwards` leaves it applied after
                     the animation ends, and a transformed element is a
                     backdrop root. So anything inside this box sees an empty
                     backdrop — a blur on `SubjectSuggestions` itself filters
                     nothing at any radius.

                     On the wrapper the filter is resolved against the parent
                     instead, which does contain the quick searches under it.
                     `rounded-[16px]` matches the panel inside it so the
                     blurred region takes the same corners rather than
                     squaring them off. */
                  <div
                    data-state={dropdownVisible ? 'open' : 'closed'}
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-[16px] backdrop-blur-[12px] duration-150 ease-in fill-mode-forwards data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:pointer-events-none"
                  >
                    <SubjectSuggestions
                      query={name}
                      suggestions={suggestions}
                      isLoading={suggestionsLoading}
                      onSelect={handleSelectSuggestion}
                      highlight={highlight}
                      onHighlightChange={setHighlight}
                      active={dropdownVisible}
                    />
                  </div>
                )}
              </div>

              {/* The quick searches recede behind the open panel rather than
                  vanishing: they keep their place and fade, so the layout
                  under the composer stays the same shape whether you are
                  typing or not. Receded, they also drop out of hit-testing and
                  the tab order — a moment is a one-click generation of a
                  *different* subject, so one left live under a half-covering
                  panel is a mis-click that throws away whatever the user was
                  typing.

                  Keyed to `renderDropdown`, not `dropdownVisible`, so the fade
                  holds through the panel's exit animation instead of the
                  moments brightening under a panel that is still on screen. */}
              <QuickSearchMoments
                moments={moments}
                onSelect={handleQuickSearch}
                onShuffle={shuffleMoments}
                receded={renderDropdown}
              />

              {error && (
                <div className="mt-[16px] flex flex-wrap items-baseline gap-2">
                  <p className="text-sm text-red-400 m-0">{error}</p>
                  {retryProvider && onRetryWithProvider && (
                    <button
                      type="button"
                      onClick={() => onRetryWithProvider(retryProvider)}
                      className="text-sm text-[#9B9EA3] underline hover:text-[#DADEE5] transition-colors"
                    >
                      Retry with {PROVIDER_META[retryProvider].label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
