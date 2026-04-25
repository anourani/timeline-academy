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

export async function searchWikipedia(
  query: string,
  options?: WikipediaSearchOptions
): Promise<SubjectSuggestion[]> {
  const limit = options?.limit ?? 6
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(
    query
  )}&limit=${limit}`

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
      results.push({ title: page.title, description })
    }
    return results
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    return []
  }
}
