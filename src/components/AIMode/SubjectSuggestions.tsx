import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_SUBJECT_SUGGESTIONS, SUBJECT_SUGGESTIONS } from '@/constants/aiSubjectSuggestions'

interface SubjectSuggestionsProps {
  query: string
  onSelect: (suggestion: string) => void
}

export function SubjectSuggestions({ query, onSelect }: SubjectSuggestionsProps) {
  const [highlight, setHighlight] = useState(0)
  const trimmed = query.trim()
  const showPrefix = trimmed.length >= 3

  const suggestions = useMemo(() => {
    if (trimmed.length < 3) return DEFAULT_SUBJECT_SUGGESTIONS
    const lower = trimmed.toLowerCase()
    return SUBJECT_SUGGESTIONS.filter((s) => s.toLowerCase().startsWith(lower))
  }, [trimmed])

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
      className="flex flex-col items-stretch gap-[2px] w-[260px] max-w-full py-[12px] px-[4px] rounded-[8px] border border-[#262626] bg-[#171717] shadow-[0px_8px_32px_0px_rgba(155,158,163,0.04)]"
      role="listbox"
    >
      {suggestions.map((s, i) => {
        const matchLen = showPrefix ? trimmed.length : 0
        const prefix = s.slice(0, matchLen)
        const rest = s.slice(matchLen)
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
              "font-['Aleo'] text-[18px] leading-[1.4] font-normal text-left h-[33px] px-[12px] py-[4px] rounded-[8px] flex items-center transition-colors",
              i === highlight ? 'bg-[#262626]' : 'hover:bg-[#262626]',
            ].join(' ')}
          >
            {matchLen > 0 ? (
              <>
                <span className="text-text-secondary">{prefix}</span>
                <span className="text-text-tertiary">{rest}</span>
              </>
            ) : (
              <span className="text-text-secondary">{s}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
