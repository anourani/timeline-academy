// Date fact-check for World Events, against Wikipedia and Wikidata.
//
// The model proposes each event with the title of its English Wikipedia
// article. Nothing reaches the lane on the model's word alone:
//
//   1. The article must exist. Its title is resolved through redirects; if
//      it is missing (or a disambiguation page), the event title is searched
//      instead, once.
//   2. If the article's Wikidata item carries a date (point in time, start
//      and end, discovery, launch, inception…), those dates REPLACE the
//      model's. An article found only by searching must agree with the
//      model to within a year first, since a search can land on the wrong
//      page.
//   3. With no structured date, the event survives only if its year appears
//      in the article's opening paragraphs, and it keeps the model's dates.
//   4. Anything else is dropped.
//
// Browser-direct, like wikipediaSearch and wikipediaImage: no server round
// trip and no cost to anyone. Both hosts must be in netlify.toml connect-src.
// A failed lookup throws rather than letting unchecked dates through, so the
// lane shows its "couldn't load" state and offers a retry.

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'
const WIKIPEDIA_SEARCH = 'https://en.wikipedia.org/w/rest.php/v1/search/page'
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'

export interface WorldEventCandidate {
  title: string
  startDate: string
  endDate: string
  /** The model's claimed English Wikipedia article title. */
  wikipedia?: string
}

export interface VerifiedWorldEvent {
  title: string
  startDate: string
  endDate: string
  /** The article the dates were checked against. */
  article: { title: string; url: string }
}

interface PageInfo {
  title: string
  qid: string | null
  extract: string
}

/** Single-date properties, in order of preference for an event's start. */
const START_PROPS = [
  'P585', // point in time
  'P580', // start time
  'P575', // time of discovery or invention
  'P619', // UTC date of spacecraft launch
  'P606', // first flight
  'P1619', // date of official opening
  'P571', // inception
  'P577', // publication date
  'P1191', // date of first performance
  'P729', // service entry
]
const END_PROP = 'P582' // end time

export async function verifyWorldEvents(
  candidates: WorldEventCandidate[],
  signal?: AbortSignal,
): Promise<VerifiedWorldEvent[]> {
  if (candidates.length === 0) return []

  // 1. Resolve each claimed article (or, failing a claim, the title itself).
  const named = candidates.map((c) => (c.wikipedia?.trim() || c.title).slice(0, 250))
  const pages = await fetchPages(named, signal)
  const resolved: Array<{ page: PageInfo | null; viaSearch: boolean }> = named.map((n) => ({
    page: pages.get(n) ?? null,
    viaSearch: false,
  }))

  // One search per miss, then one more batch lookup for whatever it found.
  const misses = candidates.map((_, i) => i).filter((i) => !resolved[i].page)
  if (misses.length > 0) {
    const found = await Promise.all(misses.map((i) => searchTitle(candidates[i].title, signal)))
    const searched = found.filter((t): t is string => !!t)
    const searchedPages = searched.length > 0 ? await fetchPages(searched, signal) : new Map()
    misses.forEach((i, k) => {
      const t = found[k]
      const page = t ? searchedPages.get(t) ?? null : null
      if (page) resolved[i] = { page, viaSearch: true }
    })
  }

  // 2. Structured dates for every article that has a Wikidata item.
  const qids = [...new Set(resolved.map((r) => r.page?.qid).filter((q): q is string => !!q))]
  const claims = qids.length > 0 ? await fetchClaims(qids, signal) : new Map<string, Claims>()

  // 3. Decide, event by event.
  const out: VerifiedWorldEvent[] = []
  candidates.forEach((c, i) => {
    const { page, viaSearch } = resolved[i]
    if (!page) return
    const article = { title: page.title, url: articleUrl(page.title) }
    const dates = page.qid ? datesFromClaims(claims.get(page.qid)) : null

    if (dates) {
      if (viaSearch && Math.abs(yearOf(dates.startDate) - yearOf(c.startDate)) > 1) return
      out.push({ title: c.title, startDate: dates.startDate, endDate: dates.endDate, article })
      return
    }

    const year = String(yearOf(c.startDate))
    if (new RegExp(`\\b${year}\\b`).test(page.extract)) {
      out.push({ title: c.title, startDate: c.startDate, endDate: c.endDate, article })
    }
  })
  return out
}

function articleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function yearOf(date: string): number {
  return parseInt(date.slice(0, 4), 10)
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Fact-check lookup failed (${res.status})`)
  return res.json()
}

/**
 * Look up articles by title, following normalisation and redirects. Returns a
 * map from each *requested* title to its page; missing pages and
 * disambiguation pages are left out.
 */
async function fetchPages(titles: string[], signal?: AbortSignal): Promise<Map<string, PageInfo>> {
  const unique = [...new Set(titles)]
  const result = new Map<string, PageInfo>()
  // The intro-extract module answers for at most 20 pages per request.
  for (let i = 0; i < unique.length; i += 20) {
    const batch = unique.slice(i, i + 20)
    const params = new URLSearchParams({
      action: 'query',
      titles: batch.join('|'),
      redirects: '1',
      prop: 'pageprops|extracts',
      ppprop: 'wikibase_item|disambiguation',
      exintro: '1',
      explaintext: '1',
      exlimit: 'max',
      format: 'json',
      formatversion: '2',
      origin: '*',
    })
    const json = (await getJson(`${WIKIPEDIA_API}?${params}`, signal)) as {
      query?: {
        normalized?: Array<{ from: string; to: string }>
        redirects?: Array<{ from: string; to: string }>
        pages?: Array<{
          title: string
          missing?: boolean
          invalid?: boolean
          pageprops?: { wikibase_item?: string; disambiguation?: string }
          extract?: string
        }>
      }
    }
    const q = json.query ?? {}
    const normalized = new Map((q.normalized ?? []).map((n) => [n.from, n.to]))
    const redirects = new Map((q.redirects ?? []).map((r) => [r.from, r.to]))
    const byTitle = new Map(
      (q.pages ?? [])
        .filter((p) => !p.missing && !p.invalid && p.pageprops?.disambiguation === undefined)
        .map((p) => [p.title, p]),
    )
    for (const requested of batch) {
      const n = normalized.get(requested) ?? requested
      const final = redirects.get(n) ?? n
      const p = byTitle.get(final)
      if (p) {
        result.set(requested, {
          title: p.title,
          qid: p.pageprops?.wikibase_item ?? null,
          extract: p.extract ?? '',
        })
      }
    }
  }
  return result
}

async function searchTitle(query: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const json = (await getJson(
      `${WIKIPEDIA_SEARCH}?q=${encodeURIComponent(query)}&limit=1`,
      signal,
    )) as { pages?: Array<{ title?: string }> }
    return json.pages?.[0]?.title ?? null
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return null
  }
}

interface TimeValue {
  time: string
  precision: number
}

type Claims = Record<
  string,
  Array<{ rank?: string; mainsnak?: { datavalue?: { value?: TimeValue } } }>
>

async function fetchClaims(qids: string[], signal?: AbortSignal): Promise<Map<string, Claims>> {
  const result = new Map<string, Claims>()
  for (let i = 0; i < qids.length; i += 50) {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: qids.slice(i, i + 50).join('|'),
      props: 'claims',
      format: 'json',
      origin: '*',
    })
    const json = (await getJson(`${WIKIDATA_API}?${params}`, signal)) as {
      entities?: Record<string, { claims?: Claims }>
    }
    for (const [id, entity] of Object.entries(json.entities ?? {})) {
      if (entity.claims) result.set(id, entity.claims)
    }
  }
  return result
}

/** A Wikidata time as YYYY-MM-DD, or null when it is BC or coarser than a year. */
function toDate(value: TimeValue | undefined): string | null {
  if (!value || typeof value.time !== 'string' || value.precision < 9) return null
  const m = /^\+(\d{1,4})-(\d{2})-(\d{2})T/.exec(value.time)
  if (!m) return null
  const year = m[1].padStart(4, '0')
  if (year === '0000') return null
  const month = value.precision >= 10 && m[2] !== '00' ? m[2] : '01'
  const day = value.precision >= 11 && m[3] !== '00' ? m[3] : '01'
  return `${year}-${month}-${day}`
}

/** The best-ranked usable date for one property. */
function claimDate(claims: Claims, prop: string): string | null {
  const list = (claims[prop] ?? []).filter((c) => c.rank !== 'deprecated')
  const ordered = [...list.filter((c) => c.rank === 'preferred'), ...list.filter((c) => c.rank !== 'preferred')]
  for (const c of ordered) {
    const d = toDate(c.mainsnak?.datavalue?.value)
    if (d) return d
  }
  return null
}

function datesFromClaims(claims: Claims | undefined): { startDate: string; endDate: string } | null {
  if (!claims) return null
  for (const prop of START_PROPS) {
    const start = claimDate(claims, prop)
    if (!start) continue
    const end = claimDate(claims, END_PROP)
    return { startDate: start, endDate: end && end >= start ? end : start }
  }
  return null
}
