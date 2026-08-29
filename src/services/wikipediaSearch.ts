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

const JUNK_DESCRIPTION_SUBSTRINGS = ['given name', 'family name', 'mythology']

// Geographic and natural-world subjects rarely make promising timelines.
// Wikipedia short descriptions for these are formulaic enough to match on
// their opening words ("City in northern Syria", "Capital of Karnataka,
// India", "Species of mammal"). Countries are deliberately left in — a
// country's history is a legitimate topic timeline in a way a mid-size
// city's isn't.
const JUNK_DESCRIPTION_PREFIXES = [
  'city in',
  'city and',
  'city of',
  'capital of',
  'capital and',
  'capital city',
  'town in',
  'village in',
  'place in',
  'human settlement',
  'municipality',
  'commune in',
  'borough',
  'suburb',
  'neighbourhood',
  'neighborhood',
  'county in',
  'county of',
  'district in',
  'district of',
  'province in',
  'province of',
  'region in',
  'region of',
  'u.s. state',
  'census-designated place',
  'airport in',
  'river in',
  'mountain in',
  'mountain range',
  'lake in',
  'island in',
  'species of',
  'genus of',
  'breed of',
]

function isJunkDescription(description: string | undefined): boolean {
  if (!description) return false
  const lower = description.toLowerCase()
  if (JUNK_DESCRIPTION_EXACT.includes(lower)) return true
  if (JUNK_DESCRIPTION_SUBSTRINGS.some((s) => lower.includes(s))) return true
  if (JUNK_DESCRIPTION_PREFIXES.some((p) => lower.startsWith(p))) return true
  return false
}

// Facet/meta articles about a subject rather than subjects in their own right —
// "Adolf Hitler in popular culture" doesn't make a timeline distinct from
// "Adolf Hitler".
const FACET_TITLE_SUBSTRINGS = [
  'in popular culture',
  'cultural depictions of',
  'in fiction',
  '(disambiguation)',
  'discography',
  'filmography',
]

// Prefix-only: a contains-match on "list of" would filter legitimate works
// like "The List of Adrian Messenger".
const FACET_TITLE_PREFIXES = ['list of', 'bibliography of']

function isFacetTitle(title: string): boolean {
  const lower = title.toLowerCase()
  if (FACET_TITLE_SUBSTRINGS.some((s) => lower.includes(s))) return true
  if (FACET_TITLE_PREFIXES.some((p) => lower.startsWith(p))) return true
  return false
}

// Name particles that legitimately extend another result's name — "John F.
// Kennedy Jr." is a distinct subject, not a facet of "John F. Kennedy".
const NAME_SUFFIX_TOKENS = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])

function isLetterOrDigit(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch)
}

/**
 * True when `candidate` reads as a facet of `base`: it contains the whole of
 * `base` on word boundaries plus extra words ("Religious views of Adolf
 * Hitler", "Adolf Hitler's rise to power") — unless everything beyond `base`
 * is a name suffix, which marks a different person rather than a facet.
 */
function isFacetOf(candidate: string, base: string): boolean {
  const lowerCandidate = candidate.toLowerCase()
  const lowerBase = base.toLowerCase()
  const idx = lowerCandidate.indexOf(lowerBase)
  if (idx < 0) return false
  if (isLetterOrDigit(lowerCandidate[idx - 1])) return false
  if (isLetterOrDigit(lowerCandidate[idx + lowerBase.length])) return false
  const rest =
    lowerCandidate.slice(0, idx) + ' ' + lowerCandidate.slice(idx + lowerBase.length)
  const restTokens = rest.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (restTokens.length === 0) return false
  return !restTokens.every((token) => NAME_SUFFIX_TOKENS.has(token))
}

export async function searchWikipedia(
  query: string,
  options?: WikipediaSearchOptions
): Promise<SubjectSuggestion[]> {
  const limit = options?.limit ?? 6
  // Over-fetch so the facet and dedupe filters below can still fill `limit`
  // slots on queries dominated by sub-articles of one subject.
  const fetchLimit = Math.min(limit * 3, 20)
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(
    query
  )}&limit=${fetchLimit}`

  try {
    const response = await fetch(url, { signal: options?.signal })
    if (!response.ok) return []

    const data = (await response.json()) as WikipediaRestResponse
    if (!data || !Array.isArray(data.pages)) return []

    // Collect every viable candidate before deduping: the base article can
    // rank below one of its facets, and the dedupe pass must see both.
    const candidates: SubjectSuggestion[] = []
    for (const page of data.pages as WikipediaRestPage[]) {
      if (!page || typeof page.title !== 'string') continue
      const description = typeof page.description === 'string' && page.description.length > 0
        ? page.description
        : undefined
      if (isJunkDescription(description)) continue
      if (isFacetTitle(page.title)) continue
      candidates.push({ title: page.title, description })
    }

    const results = candidates.filter(
      (c) => !candidates.some((other) => other !== c && isFacetOf(c.title, other.title))
    )
    return results.slice(0, limit)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    return []
  }
}
