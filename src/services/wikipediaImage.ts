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

async function searchPage(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(
    title,
  )}&limit=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  const page = json?.pages?.[0]
  if (!page?.title) return null
  return page.title as string
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

export async function fetchWikipediaImage(title: string): Promise<ImageResult> {
  try {
    if (!title.trim()) return EMPTY

    const pageTitle = await searchPage(title.trim())
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
