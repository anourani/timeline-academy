import { useEffect } from 'react'
import { Search } from 'lucide-react'
import type { SubjectSuggestion } from '@/constants/aiSubjectSuggestions'

interface SubjectSuggestionsProps {
  query: string
  suggestions: SubjectSuggestion[]
  isLoading: boolean
  onSelect: (suggestion: string) => void
  /**
   * The highlighted row, owned by the parent so the input can point
   * `aria-activedescendant` at it. The parent resets it when the query changes.
   */
  highlight: number
  onHighlightChange: (index: number) => void
  /**
   * Whether the panel is open rather than playing its exit animation. The
   * keyboard only drives it while open: once a row is picked the panel stays
   * mounted for its 180ms fade, and an Enter pressed in that window belongs to
   * the form, not to a list that is already on its way out.
   */
  active: boolean
}

/** Shared with the input's `aria-controls` and `aria-activedescendant`. */
export const SUGGESTIONS_LISTBOX_ID = 'subject-suggestions'
export const SUGGESTION_OPTION_ID_PREFIX = 'subject-option-'

const SKELETON_WIDTHS = ['60%', '75%', '50%', '65%', '70%', '55%']

export function SubjectSuggestions({
  query,
  suggestions,
  isLoading,
  onSelect,
  highlight,
  onHighlightChange,
  active,
}: SubjectSuggestionsProps) {
  const lowerQuery = query.trim().toLowerCase()

  useEffect(() => {
    if (!active || isLoading || suggestions.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        onHighlightChange((highlight + 1) % suggestions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        onHighlightChange((highlight - 1 + suggestions.length) % suggestions.length)
      } else if (e.key === 'Enter') {
        // Cancelling keydown is what stops the form's implicit submission:
        // that is the key's default action, and it runs only after dispatch
        // has finished, so this window listener still gets there first.
        const pick = suggestions[highlight] ?? suggestions[0]
        e.preventDefault()
        onSelect(pick.title)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, isLoading, suggestions, highlight, onHighlightChange, onSelect])

  if (!isLoading && suggestions.length === 0) return null

  return (
    /* The backdrop blur this surface is specced with is deliberately NOT
       here — it lives on the positioning wrapper in `NewTimelineScreen`, which
       is the only place it can do anything. A blur on this element has an
       empty backdrop to work on; the wrapper's entrance animation leaves a
       transform on it, and a transformed element is a backdrop root, so
       nothing painted outside it is visible to a filter inside it.

       `[color-scheme:dark]` is what keeps the scrollbar dark: without it the
       browser draws its light default on this near-black panel. */
    <div
      id={SUGGESTIONS_LISTBOX_ID}
      role="listbox"
      aria-busy={isLoading ? 'true' : 'false'}
      className="flex flex-col gap-[2px] w-full p-[8px] rounded-[16px] border border-[#262626] bg-[rgba(23,23,23,0.94)] shadow-[0_16px_40px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[270px] max-md:max-h-[340px] [color-scheme:dark] [scrollbar-width:thin]"
    >
      {isLoading
        ? SKELETON_WIDTHS.map((width, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="shrink-0 min-h-[48px] md:min-h-[40px] px-[12px] rounded-[10px] flex items-center gap-[12px]"
            >
              <div className="size-[16px] shrink-0 rounded-[4px] bg-white/[0.08] animate-pulse" />
              <div
                className="h-[14px] rounded-[4px] bg-white/[0.08] animate-pulse"
                style={{ width }}
              />
            </div>
          ))
        : suggestions.map((s, i) => {
            const matchIdx = lowerQuery.length > 0 ? s.title.toLowerCase().indexOf(lowerQuery) : -1
            const before = matchIdx > 0 ? s.title.slice(0, matchIdx) : ''
            const match = matchIdx >= 0 ? s.title.slice(matchIdx, matchIdx + lowerQuery.length) : ''
            const after = matchIdx >= 0 ? s.title.slice(matchIdx + lowerQuery.length) : ''
            return (
              <button
                key={s.title}
                id={`${SUGGESTION_OPTION_ID_PREFIX}${i}`}
                type="button"
                role="option"
                aria-selected={i === highlight}
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(s.title)
                }}
                onClick={() => onSelect(s.title)}
                onMouseEnter={() => onHighlightChange(i)}
                className={[
                  'w-full shrink-0 flex items-center gap-[12px] px-[12px] min-h-[48px] md:min-h-[40px] rounded-[10px] text-left transition-colors',
                  i === highlight ? 'bg-[#262626]' : 'hover:bg-[#262626]',
                ].join(' ')}
              >
                <Search size={16} className="shrink-0 text-[#6D7073]" aria-hidden="true" />
                {/* Stacked below `md`, where the width cannot hold a title and
                    its description on one line; inline and truncated as one
                    run above it. */}
                <span className="min-w-0 flex-1 flex flex-col md:block md:truncate">
                  <span className="truncate md:inline font-['Aleo',serif] font-normal text-[16px] md:text-[17px] leading-[1.4]">
                    {matchIdx >= 0 ? (
                      <>
                        {before && <span className="text-[#9B9EA3]">{before}</span>}
                        <span className="text-[#DADEE5]">{match}</span>
                        {after && <span className="text-[#9B9EA3]">{after}</span>}
                      </>
                    ) : (
                      <span className="text-[#DADEE5]">{s.title}</span>
                    )}
                  </span>
                  {s.description && (
                    <span className="truncate md:inline md:ml-[8px] font-['Avenir',sans-serif] text-[13px] md:text-[14px] leading-[20px] text-[#6D7073]">
                      {s.description}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
    </div>
  )
}
