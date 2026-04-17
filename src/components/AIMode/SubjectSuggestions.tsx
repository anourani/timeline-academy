import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_SUBJECT_SUGGESTIONS, SUBJECT_SUGGESTIONS } from '@/constants/aiSubjectSuggestions'

interface SubjectSuggestionsProps {
  query: string
  onSelect: (suggestion: string) => void
}

export function SubjectSuggestions({ query, onSelect }: SubjectSuggestionsProps) {
  const [highlight, setHighlight] = useState(0)

  const suggestions = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed.length < 3) return DEFAULT_SUBJECT_SUGGESTIONS
    const lower = trimmed.toLowerCase()
    return SUBJECT_SUGGESTIONS.filter((s) => s.toLowerCase().startsWith(lower))
  }, [query])

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
      className="absolute left-0 top-full mt-[8px] z-20 flex flex-col gap-[2px] rounded-[12px] border border-[#3d3e40] bg-[#171717] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)] p-[6px] min-w-[280px]"
      role="listbox"
    >
      {suggestions.map((s, i) => (
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
            i === highlight
              ? 'bg-[#262626] text-text-primary'
              : 'text-text-secondary hover:bg-[#262626]',
          ].join(' ')}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
