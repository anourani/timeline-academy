import { useEffect, useState } from 'react'
import {
  DEFAULT_SUBJECT_SUGGESTIONS,
  type SubjectSuggestion,
} from '@/constants/aiSubjectSuggestions'
import { searchWikipedia } from '@/services/wikipediaSearch'

export interface UseSubjectSuggestionsResult {
  suggestions: SubjectSuggestion[]
  isLoading: boolean
}

export function useSubjectSuggestions(query: string): UseSubjectSuggestionsResult {
  const [suggestions, setSuggestions] = useState<SubjectSuggestion[]>(DEFAULT_SUBJECT_SUGGESTIONS)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length === 0) {
      setSuggestions(DEFAULT_SUBJECT_SUGGESTIONS)
      setIsLoading(false)
      return
    }

    if (trimmed.length === 1) {
      setSuggestions([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(async () => {
      try {
        const result = await searchWikipedia(trimmed, {
          signal: controller.signal,
          limit: 6,
        })
        setSuggestions(result.slice(0, 6))
        setIsLoading(false)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setSuggestions([])
        setIsLoading(false)
      }
    }, 200)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [query])

  return { suggestions, isLoading }
}
