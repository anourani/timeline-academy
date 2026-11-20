// Wikimedia image lookup for an event title, done directly from the browser
// (the same pattern as wikipediaSearch.ts). This replaced the fetch-event-image
// edge function: no server round-trip, no server billing, and the visitor's
// browser talks to Wikipedia exactly as it already does for autocomplete.
//
// Best-effort: any failure path returns { imageUrl: null, attribution: null }
// rather than erroring so the detail panel can render gracefully.

interface ImageResult {
  imageUrl: string | null
  attribution: string | null
}

const EMPTY: ImageResult = { imageUrl: null, attribution: null }

// Strip HTML tags from Wikimedia attribution metadata (Commons returns rich HTML).
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

// Words that identify the subject ("Paddy Pimblett" → paddy, pimblett).
// Short words ("of", "the", "WW2"'s digits aside) say nothing about whether
// a page is the right one.
function subjectWords(subject: string): string[] {
  return subject
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4)
}

/**
 * The Wikipedia page whose image illustrates this event, or null.
 *
 * Searching the event title alone and taking the top hit is what put a photo
 * of Joe Biden on "Post-fight speech on men's mental health goes viral" in a
 * Paddy Pimblett timeline: the title doesn't name its subject, so Wikipedia's
 * best match was about something else entirely. So the subject goes into the
 * query, and a hit is only accepted if its title or snippet mentions the
 * subject. No relevant hit means no image — an empty frame is better than a
 * confidently wrong photo.
 */
async function searchPage(title: string, subject?: string): Promise<string | null> {
  const words = subject ? subjectWords(subject) : []
  const query = words.length > 0 ? `${title} ${subject}` : title
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(
    query,
  )}&limit=5`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  const pages = (json?.pages ?? []) as Array<{
    title?: string
    excerpt?: string
    description?: string
  }>

  for (const page of pages) {
    if (!page?.title) continue
    if (words.length === 0) return page.title
    const haystack = [page.title, page.excerpt ?? '', page.description ?? '']
      .join(' ')
      .toLowerCase()
    if (words.some((w) => haystack.includes(w))) return page.title
  }
  return null
}

async function fetchPageImage(
  pageTitle: string,
): Promise<{ thumbUrl: string | null; fileTitle: string | null }> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=600&piprop=thumbnail|name&titles=${encodeURIComponent(
    pageTitle,
  )}&format=json&origin=*`
  const res = await fetch(url)
  if (!res.ok) return { thumbUrl: null, fileTitle: null }
  const json = await res.json()
  const pages = json?.query?.pages
  if (!pages) return { thumbUrl: null, fileTitle: null }
  const firstKey = Object.keys(pages)[0]
  const page = pages[firstKey]
  const thumbUrl = page?.thumbnail?.source ?? null
  const fileName = page?.pageimage ?? null
  const fileTitle = fileName ? `File:${fileName}` : null
  return { thumbUrl, fileTitle }
}

async function fetchImageMeta(
  fileTitle: string,
): Promise<{ author: string | null; license: string | null }> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
    fileTitle,
  )}&prop=imageinfo&iiprop=extmetadata&format=json&origin=*`
  const res = await fetch(url)
  if (!res.ok) return { author: null, license: null }
  const json = await res.json()
  const pages = json?.query?.pages
  if (!pages) return { author: null, license: null }
  const firstKey = Object.keys(pages)[0]
  const page = pages[firstKey]
  const meta = page?.imageinfo?.[0]?.extmetadata
  if (!meta) return { author: null, license: null }
  const author = meta.Artist?.value ? stripHtml(meta.Artist.value) : null
  const license = meta.LicenseShortName?.value ?? meta.UsageTerms?.value ?? null
  return { author, license }
}

function buildAttribution(author: string | null, license: string | null): string {
  if (author && license) return `Photo: ${author} / ${license}`
  if (author) return `Photo: ${author}`
  if (license) return `Photo: Wikimedia Commons / ${license}`
  return 'Photo: Wikimedia Commons'
}

export async function fetchWikipediaImage(
  title: string,
  subject?: string,
): Promise<ImageResult> {
  try {
    if (!title.trim()) return EMPTY

    const pageTitle = await searchPage(title.trim(), subject?.trim())
    if (!pageTitle) return EMPTY

    const { thumbUrl, fileTitle } = await fetchPageImage(pageTitle)
    if (!thumbUrl) return EMPTY

    let author: string | null = null
    let license: string | null = null
    if (fileTitle) {
      const meta = await fetchImageMeta(fileTitle)
      author = meta.author
      license = meta.license
    }

    return {
      imageUrl: thumbUrl,
      attribution: buildAttribution(author, license),
    }
  } catch {
    return EMPTY
  }
}
