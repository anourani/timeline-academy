export interface WikipediaSearchOptions {
  signal?: AbortSignal
  limit?: number
}

export async function searchWikipediaTitles(
  query: string,
  options?: WikipediaSearchOptions
): Promise<string[]> {
  const limit = options?.limit ?? 6
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
    query
  )}&limit=${limit}&namespace=0&format=json&origin=*`

  try {
    const response = await fetch(url, { signal: options?.signal })
    if (!response.ok) return []

    const data = await response.json()
    if (!Array.isArray(data) || data.length < 2) return []

    const titles = data[1]
    if (!Array.isArray(titles) || !titles.every((t) => typeof t === 'string')) return []

    return titles
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    return []
  }
}
