import { useEffect, useState } from 'react'
import {
  MIN_SUGGESTION_QUERY_LENGTH,
  type SubjectSuggestion,
} from '@/constants/aiSubjectSuggestions'
import { searchWikipedia } from '@/services/wikipediaSearch'

export interface UseSubjectSuggestionsResult {
  suggestions: SubjectSuggestion[]
  isLoading: boolean
}

export function useSubjectSuggestions(query: string): UseSubjectSuggestionsResult {
  // Empty, not a set of defaults: the dropdown no longer opens on focus, so a
  // query too short to search is a query with nothing to show.
  const [suggestions, setSuggestions] = useState<SubjectSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < MIN_SUGGESTION_QUERY_LENGTH) {
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
