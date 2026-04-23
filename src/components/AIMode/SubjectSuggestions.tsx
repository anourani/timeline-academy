import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_SUBJECT_SUGGESTIONS, SUBJECT_SUGGESTIONS } from '@/constants/aiSubjectSuggestions'

interface SubjectSuggestionsProps {
  query: string
  onSelect: (suggestion: string) => void
}

export function SubjectSuggestions({ query, onSelect }: SubjectSuggestionsProps) {
  const [highlight, setHighlight] = useState(0)
  const trimmed = query.trim()
  const lowerQuery = trimmed.toLowerCase()

  const suggestions = useMemo(() => {
    if (trimmed.length === 0) return DEFAULT_SUBJECT_SUGGESTIONS
    return SUBJECT_SUGGESTIONS.filter((s) => s.toLowerCase().includes(lowerQuery)).slice(0, 6)
  }, [trimmed, lowerQuery])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  useEffect(() => {
    if (suggestions.length === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => (h + 1) % suggestions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [suggestions.length])

  if (suggestions.length === 0) return null

  return (
    <div
      className="flex flex-col items-stretch gap-[2px] w-[320px] max-w-full py-[12px] px-[8px] rounded-[8px] border border-[#262626] bg-[rgba(184,184,184,0.04)] backdrop-blur-[4px] shadow-[0px_8px_32px_0px_rgba(155,158,163,0.04)]"
      role="listbox"
    >
      {suggestions.map((s, i) => {
        const matchIdx = lowerQuery.length > 0 ? s.toLowerCase().indexOf(lowerQuery) : -1
        const before = matchIdx > 0 ? s.slice(0, matchIdx) : ''
        const match = matchIdx >= 0 ? s.slice(matchIdx, matchIdx + lowerQuery.length) : ''
        const after = matchIdx >= 0 ? s.slice(matchIdx + lowerQuery.length) : ''
        return (
          <button
            key={s}
            type="button"
            role="option"
            aria-selected={i === highlight}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(s)
            }}
            onMouseEnter={() => setHighlight(i)}
            className={[
              'header-xsmall text-left h-[36px] px-[12px] py-[4px] rounded-[8px] flex items-center transition-colors',
              i === highlight ? 'bg-[#262626]' : 'hover:bg-[#262626]',
            ].join(' ')}
          >
            <span className="flex-1 min-w-0 truncate">
              {matchIdx >= 0 ? (
                <>
                  {before && <span className="text-text-tertiary">{before}</span>}
                  <span className="text-text-secondary">{match}</span>
                  {after && <span className="text-text-tertiary">{after}</span>}
                </>
              ) : (
                <span className="text-text-secondary">{s}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
