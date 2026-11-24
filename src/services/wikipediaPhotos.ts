// The event view's photo gallery, looked up from the event's Wikipedia
// article, browser-direct like wikipediaImage.ts
// (docs/2026-11-24-event-view-prd.md §5). Which article that is — and when
// there is none — is wikipediaArticle.ts's call.
//
// Two requests to en.wikipedia.org once the article is known — the lead
// image's name, and every image on the article with its size, type and
// Commons metadata — so `connect-src` needs nothing new, and the 1600px
// renditions come from upload.wikimedia.org, which `img-src` already allows.
//
// A network failure rejects, so the caller can tell "Wikipedia has nothing
// relevant" (an empty gallery, cached) from "could not ask" (not cached, and
// the event's stored lead image stands in).

import type { EventPhoto } from '@/types/event'
import { buildAttribution, stripHtml } from './wikipediaImage'
import { searchRelevantArticle } from './wikipediaArticle'

const API = 'https://en.wikipedia.org/w/api.php'
const WIDTH = 1600
const THUMB_WIDTH = 240
const MAX_PHOTOS = 6
const MIN_WIDTH = 800
const MIN_HEIGHT = 500
const CAPTION_MAX = 120

const PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * File names that are page furniture rather than pictures of the event:
 * logos, icons, flags, maps, signatures, heraldry, portal and stub badges.
 */
const CHROME_NAME = /logo|icon|flag|map|signature|coat.of.arms|seal|symbol|portal|commons-|wiki|stub|disambig|question.book/i

interface ImageInfo {
  url?: string
  thumburl?: string
  width?: number
  height?: number
  mime?: string
  extmetadata?: Record<string, { value?: string } | undefined>
}

interface FilePage {
  title?: string
  imageinfo?: ImageInfo[]
}

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`
}

/** "File:Pierre_and_Marie_Curie.jpg" → "Pierre and Marie Curie". */
function nameAsCaption(fileTitle: string): string {
  return fileTitle
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/_/g, ' ')
    .trim()
}

/** A thumbnail URL rescaled to another width, when it is a scalable one. */
function rescale(thumbUrl: string, width: number): string | null {
  const m = thumbUrl.match(/\/(\d+)px-[^/]+$/)
  if (!m) return null
  return thumbUrl.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`)
}

async function leadImageName(pageTitle: string): Promise<string | null> {
  const url = `${API}?action=query&prop=pageimages&piprop=name&redirects=1&titles=${encodeURIComponent(
    pageTitle,
  )}&format=json&origin=*`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  const pages = json?.query?.pages
  if (!pages) return null
  const page = pages[Object.keys(pages)[0]]
  return typeof page?.pageimage === 'string' ? `File:${page.pageimage}` : null
}

async function articleImages(pageTitle: string): Promise<FilePage[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'images',
    titles: pageTitle,
    // A source URL may name a redirect ("Nvidia_CUDA"); follow it.
    redirects: '1',
    gimlimit: '50',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(WIDTH),
    iiextmetadatafilter: 'ImageDescription|Artist|LicenseShortName|UsageTerms',
    format: 'json',
    origin: '*',
  })
  const res = await fetch(`${API}?${params.toString()}`)
  if (!res.ok) throw new Error(`Wikipedia images failed: ${res.status}`)
  const json = await res.json()
  const pages = json?.query?.pages
  return pages ? (Object.values(pages) as FilePage[]) : []
}

function toPhoto(page: FilePage): EventPhoto | null {
  const info = page.imageinfo?.[0]
  const title = page.title ?? ''
  if (!info?.url || !title) return null
  if (!info.mime || !PHOTO_MIME.has(info.mime)) return null
  if ((info.width ?? 0) < MIN_WIDTH || (info.height ?? 0) < MIN_HEIGHT) return null
  if (CHROME_NAME.test(title)) return null

  const meta = info.extmetadata ?? {}
  const description = meta.ImageDescription?.value ? stripHtml(meta.ImageDescription.value) : ''
  const author = meta.Artist?.value ? stripHtml(meta.Artist.value) : null
  const license = meta.LicenseShortName?.value ?? meta.UsageTerms?.value ?? null
  const url = info.thumburl ?? info.url

  return {
    url,
    thumbUrl: rescale(url, THUMB_WIDTH),
    caption: cutAtWord(description || nameAsCaption(title), CAPTION_MAX),
    attribution: buildAttribution(author, license),
  }
}

export interface EventGallery {
  /** The article the photos came from; null when no relevant one was found. */
  article: string | null
  photos: EventPhoto[]
}

/**
 * Up to six photos for an event, the article's lead image first. `article`
 * is the one to use when the caller already knows it (a cited Wikipedia
 * source, a World Events entry's checked article); otherwise Wikipedia is
 * searched and only a relevant result is accepted. Rejects on a network
 * failure.
 */
export async function fetchEventGallery({
  title,
  timelineTitle,
  article,
}: {
  title: string
  timelineTitle?: string
  article?: string | null
}): Promise<EventGallery> {
  const pageTitle = article || (await searchRelevantArticle(title, timelineTitle))
  if (!pageTitle) return { article: null, photos: [] }

  const [lead, files] = await Promise.all([
    leadImageName(pageTitle).catch(() => null),
    articleImages(pageTitle),
  ])
  // The lead image is the article's own choice of picture; keep it first.
  const ordered = lead
    ? [...files.filter((f) => f.title === lead), ...files.filter((f) => f.title !== lead)]
    : files

  const photos: EventPhoto[] = []
  const seen = new Set<string>()
  for (const file of ordered) {
    const photo = toPhoto(file)
    if (!photo || seen.has(photo.url)) continue
    seen.add(photo.url)
    photos.push(photo)
    if (photos.length === MAX_PHOTOS) break
  }
  return { article: pageTitle, photos }
}
