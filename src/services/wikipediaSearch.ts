import type { SubjectSuggestion } from '@/constants/aiSubjectSuggestions'

export interface WikipediaSearchOptions {
  signal?: AbortSignal
  limit?: number
}

interface WikipediaRestPage {
  title?: unknown
  description?: unknown
}

interface WikipediaRestResponse {
  pages?: unknown
}

const JUNK_DESCRIPTION_EXACT = [
  'topics referred to by the same term',
  'wikimedia disambiguation page',
  'wikimedia list article',
  'surname',
  'family name',
]

const JUNK_DESCRIPTION_SUBSTRINGS = ['given name', 'family name']

function isJunkDescription(description: string | undefined): boolean {
  if (!description) return false
  const lower = description.toLowerCase()
  if (JUNK_DESCRIPTION_EXACT.includes(lower)) return true
  if (JUNK_DESCRIPTION_SUBSTRINGS.some((s) => lower.includes(s))) return true
  return false
}

export async function searchWikipedia(
  query: string,
  options?: WikipediaSearchOptions
): Promise<SubjectSuggestion[]> {
  const limit = options?.limit ?? 6
  const fetchLimit = Math.min(limit * 2, 20)
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(
    query
  )}&limit=${fetchLimit}`

  try {
    const response = await fetch(url, { signal: options?.signal })
    if (!response.ok) return []

    const data = (await response.json()) as WikipediaRestResponse
    if (!data || !Array.isArray(data.pages)) return []

    const results: SubjectSuggestion[] = []
    for (const page of data.pages as WikipediaRestPage[]) {
      if (!page || typeof page.title !== 'string') continue
      const description = typeof page.description === 'string' && page.description.length > 0
        ? page.description
        : undefined
      if (isJunkDescription(description)) continue
      results.push({ title: page.title, description })
      if (results.length >= limit) break
    }
    return results
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    return []
  }
}
