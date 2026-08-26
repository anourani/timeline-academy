import { useState, useEffect, useRef } from 'react'
import type { SubjectType } from '@/constants/pillDefinitions'
import { SubjectSuggestions } from '@/components/AIMode/SubjectSuggestions'
import { GeneratingIndicator } from '@/components/NewTimeline/GeneratingIndicator'
import { useSubjectSuggestions } from '@/hooks/useSubjectSuggestions'
import {
  MIN_SUGGESTION_QUERY_LENGTH,
  pickQuickSearches,
} from '@/constants/aiSubjectSuggestions'
import { glassButtonClass } from '@/components/ui/glassButton'
import { PROVIDER_META } from '@/constants/byokProviders'
import type { ByokProvider } from '@/types/ai'

interface NewTimelineScreenProps {
  onAIGenerate: (subject: string) => void
  onCancel: () => void
  isGenerating: boolean
  isClassifying: boolean
  classifiedType: SubjectType | null
  categoryLabels: string[]
  error: string | null
  /** Set when the failure came from one BYOK provider and the user has a key
   *  for the other one. Null otherwise — including on the server-funded path,
   *  which has no alternative to offer. */
  retryProvider?: ByokProvider | null
  onRetryWithProvider?: (provider: ByokProvider) => void
}

const PLACEHOLDER_NAMES = [
  'Kobe Bryant',
  'World War II',
  'Frida Kahlo',
  'The Renaissance',
  'Muhammad Ali',
  'Civil Rights Movement',
]

/**
 * The field's type at each size, as one string.
 *
 * The real input and the typewriter ghost drawn on top of it have to resolve to
 * identical metrics or the animated placeholder slides off the caret — so both
 * read this rather than each carrying a copy.
 *
 * `.header-small` / `.header-medium` in `index.css` say the same thing, but
 * stacking them (`header-small md:header-medium`) leaves the winner to source
 * order between two equal-specificity utilities in the same layer, which is not
 * a contract worth resting alignment on.
 */
const SEARCH_FIELD_FONT =
  "font-['Aleo',serif] font-normal text-[24px] leading-[1.4] md:text-[32px] md:leading-[1.25]"

/** Box padding. Shared with the ghost overlay, for the same reason. */
const SEARCH_FIELD_PADDING = 'px-[11px] py-[9px] md:p-[11px]'

function BackgroundGrid() {
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

function BackgroundPattern() {
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
  onCancel,
  isGenerating,
  isClassifying,
  categoryLabels,
  error,
  retryProvider,
  onRetryWithProvider,
}: NewTimelineScreenProps) {
  const [name, setName] = useState('')
  const [placeholderText, setPlaceholderText] = useState('')
  const [placeholderPhase, setPlaceholderPhase] = useState<'typing' | 'deleting'>('typing')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [hasEngaged, setHasEngaged] = useState(false)
  const [renderDropdown, setRenderDropdown] = useState(false)
  // Drawn once per mount, so the chips rotate between visits but never move
  // under a cursor that is already reaching for one.
  const [quickSearches] = useState(pickQuickSearches)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const isWorking = isClassifying || isGenerating
  const { suggestions, isLoading: suggestionsLoading } = useSubjectSuggestions(name)

  useEffect(() => {
    if (hasEngaged) return
    const currentName = PLACEHOLDER_NAMES[placeholderIndex]

    if (placeholderPhase === 'typing') {
      if (placeholderText.length < currentName.length) {
        const t = setTimeout(() => {
          setPlaceholderText(currentName.slice(0, placeholderText.length + 1))
        }, 80)
        return () => clearTimeout(t)
      }
      const t = setTimeout(() => setPlaceholderPhase('deleting'), 1500)
      return () => clearTimeout(t)
    }

    if (placeholderText.length > 0) {
      const t = setTimeout(() => {
        setPlaceholderText(currentName.slice(0, placeholderText.length - 1))
      }, 40)
      return () => clearTimeout(t)
    }
    setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_NAMES.length)
    setPlaceholderPhase('typing')
  }, [placeholderText, placeholderPhase, placeholderIndex, hasEngaged])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isWorking) {
        onCancel()
      } else {
        setShowSuggestions(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [showSuggestions, isWorking, onCancel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || isWorking) return
    setShowSuggestions(false)
    onAIGenerate(trimmed)
  }

  const handleSelectSuggestion = (suggestion: string) => {
    setName(suggestion)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const handleQuickSearch = (subject: string) => {
    if (isWorking) return
    // Seed the field before generating: `GeneratingIndicator` reads `name`, and
    // for a signed-out visitor `onAIGenerate` opens the key/sign-in gate, which
    // should show what they asked for rather than an empty box.
    setName(subject)
    setHasEngaged(true)
    setShowSuggestions(false)
    onAIGenerate(subject)
  }

  // The length test is not redundant with the hook's: that effect runs *after*
  // render, so on the render where the query drops back to one character
  // `suggestions` still holds the previous six. Without it, backspacing flashes
  // stale rows on the way down.
  const dropdownVisible =
    showSuggestions &&
    !isWorking &&
    name.trim().length >= MIN_SUGGESTION_QUERY_LENGTH &&
    (suggestions.length > 0 || suggestionsLoading)

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
    <div className="relative min-h-screen bg-surface-primary overflow-auto [--page-gutter:16px] sm:[--page-gutter:40px] md:[--page-gutter:64px] lg:[--page-gutter:120px]">
      <BackgroundGrid />
      <BackgroundPattern />
      <div className="relative z-10">
        <div className="flex flex-col items-center gap-[40px] px-[var(--page-gutter)] pt-[160px] pb-[64px] md:pt-[200px] md:pb-[120px]">
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            aria-busy={isWorking}
            className="w-full flex flex-col items-center gap-[8px]"
          >
            <h2 className="header-xsmall text-text-tertiary m-0 text-center">
              Search for a person, era, or event
            </h2>

            {/* Everything below the heading shares one column so the chips, the
                suggestions and any error all hang off the field's left edge. */}
            <div className="w-full max-w-[440px] flex flex-col items-start gap-[4px]">
              <div className="relative w-full">
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (!isWorking) setShowSuggestions(true)
                  }}
                  onFocus={() => setHasEngaged(true)}
                  onBlur={() => {
                    if (name.trim().length === 0) setHasEngaged(false)
                  }}
                  placeholder=""
                  disabled={isWorking}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  className={`w-full rounded-[8px] border outline-none transition-colors text-text-secondary focus-visible:ring-1 focus-visible:ring-white/40 disabled:opacity-70 ${SEARCH_FIELD_PADDING} ${SEARCH_FIELD_FONT} ${
                    hasEngaged
                      ? 'bg-surface-secondary border-[#404040] shadow-[0px_8px_16px_0px_rgba(155,158,163,0.04)]'
                      : 'bg-surface-primary border-[#171717] shadow-[0px_8px_16px_0px_rgba(0,0,0,0.4)]'
                  }`}
                  aria-label="Subject for timeline generation"
                />

                {/* `border border-transparent` is load-bearing: the input has a
                    1px border and an inset-0 overlay does not, so without it the
                    ghost sits a pixel up and left of the real caret. */}
                {!hasEngaged && name === '' && (
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 flex items-center border border-transparent overflow-hidden whitespace-nowrap select-none text-text-tertiary ${SEARCH_FIELD_PADDING} ${SEARCH_FIELD_FONT}`}
                  >
                    {placeholderText}
                    <span className="animate-blink-caret">|</span>
                  </div>
                )}
              </div>

              {/* `type="button"` is required, not tidiness: the form has no
                  submit control, so Enter works only through HTML's implicit
                  submission, and a chip left as the default `submit` would
                  become the form's default button and silently take it over. */}
              <div
                role="group"
                aria-label="Quick searches"
                className="w-full flex flex-row flex-wrap items-start gap-[8px]"
              >
                {quickSearches.map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    disabled={isWorking}
                    onClick={() => handleQuickSearch(subject)}
                    className={`${glassButtonClass} shrink-0 whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none`}
                  >
                    {subject}
                  </button>
                ))}
              </div>

              {renderDropdown && (
                <div
                  data-state={dropdownVisible ? 'open' : 'closed'}
                  className="w-full duration-150 ease-in fill-mode-forwards data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:pointer-events-none"
                >
                  <SubjectSuggestions
                    query={name}
                    suggestions={suggestions}
                    isLoading={suggestionsLoading}
                    onSelect={handleSelectSuggestion}
                  />
                </div>
              )}

              {isWorking && (
                <GeneratingIndicator
                  subject={name}
                  phase={isClassifying ? 'classifying' : 'generating'}
                  categoryLabels={categoryLabels}
                />
              )}

              {!isWorking && error && (
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
