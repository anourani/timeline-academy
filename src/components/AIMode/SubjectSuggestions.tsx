import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_SUBJECT_SUGGESTIONS, SUBJECT_SUGGESTIONS } from '@/constants/aiSubjectSuggestions'

interface SubjectSuggestionsProps {
  query: string
  onSelect: (suggestion: string) => void
}

export function SubjectSuggestions({ query, onSelect }: SubjectSuggestionsProps) {
  const [highlight, setHighlight] = useState(0)
  const trimmed = query.trim()
  const showPrefixBold = trimmed.length >= 3

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
      className="absolute left-0 right-0 top-full mt-[8px] z-20 flex flex-col gap-[2px] rounded-[12px] border border-[#3d3e40] bg-[#171717] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)] p-[6px]"
      role="listbox"
    >
      {suggestions.map((s, i) => {
        const matchLen = showPrefixBold ? trimmed.length : 0
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
              "font-['Aleo'] text-[20px] leading-[1.25] text-left px-[12px] py-[8px] rounded-[8px] transition-colors",
              i === highlight ? 'bg-[#262626]' : 'hover:bg-[#262626]',
            ].join(' ')}
          >
            {matchLen > 0 ? (
              <>
                <span className="text-text-primary font-bold">{prefix}</span>
                <span className="text-text-secondary">{rest}</span>
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
