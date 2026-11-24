// The event view's photos: one picture of each person, thing or place the
// event is about — the spouse in a marriage, the product in a launch — and
// nothing else (docs/2026-11-24-event-view-prd.md §5, §14).
//
// Each subject is an exact English Wikipedia article title, and its photo is
// that article's own lead image: a person's portrait, an object's photograph.
// No article, no lead image, or only a drawing/logo means no photo for that
// subject. This replaced pulling every image on one related article, which on
// a biography meant decades of unrelated pictures — the subject at the White
// House in 2025 on the event of his 1985 marriage. No photo is better than an
// unrelated one.
//
// Browser-direct to en.wikipedia.org (already in `connect-src`); the images
// come from upload.wikimedia.org (already in `img-src`). A network failure
// rejects, so the caller can tell "nothing to show" (cached) from "could not
// ask" (not cached).

import type { EventPhoto } from '@/types/event'

const API = 'https://en.wikipedia.org/w/api.php'
/** Standard Wikimedia thumbnail steps: other widths may be refused. */
const WIDTH = 1280
const THUMB_WIDTH = 330
const MAX_SUBJECTS = 3
const MIN_SIDE = 300

/**
 * Kinds of article that are never an event's picture, read from Wikipedia's
 * one-line description of the article ("American business magazine", "Country
 * in East Asia"): publications, awards and places. An event that names one —
 * "Named Fortune Businessperson of the Year", "Mobbed by fans in Taiwan" — is
 * not about it, and its lead image (a cover, a medal, a skyline) is not a
 * picture of the event. The prompt says the same; this holds when it slips.
 */
const NEVER_PICTURED =
  /\b(magazines?|newspapers?|periodicals?|journals?|publications?|publishers?|news (agency|website|channel)|websites?|awards?|prizes?|medals?|honou?rs?|rankings?|list of|country|sovereign state|u\.s\. state|state (of|in)|republic|kingdom|nation|city|town|village|capital|municipality|county|province|prefecture|district|region|island|continent|neighbou?rhood|venue|stadium|arena|convention cent(er|re)|exhibition cent(er|re)|trade (show|fair))\b/i

/** Photographs only; an SVG lead image is a logo, a map or a diagram. */
const PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface ImageInfo {
  url?: string
  thumburl?: string
  width?: number
  height?: number
  mime?: string
  extmetadata?: Record<string, { value?: string } | undefined>
}

interface QueryPage {
  title?: string
  missing?: unknown
  invalid?: unknown
  pageimage?: string
  /** Wikipedia's short description of the article. */
  description?: string
  pageprops?: { disambiguation?: unknown }
  imageinfo?: ImageInfo[]
}

interface QueryResult {
  normalized?: { from: string; to: string }[]
  redirects?: { from: string; to: string }[]
  pages?: Record<string, QueryPage>
}

async function query(params: Record<string, string>): Promise<QueryResult> {
  const search = new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...params })
  const res = await fetch(`${API}?${search.toString()}`)
  if (!res.ok) throw new Error(`Wikipedia query failed: ${res.status}`)
  const json = await res.json()
  return (json?.query ?? {}) as QueryResult
}

/** Follow Wikipedia's title normalisation, then any redirect, to the page's real title. */
function resolveTitle(result: QueryResult, requested: string): string {
  let title = requested
  for (const n of result.normalized ?? []) if (n.from === title) title = n.to
  for (const r of result.redirects ?? []) if (r.from === title) title = r.to
  return title
}

/** Strip HTML tags from Wikimedia credit metadata (Commons returns rich HTML). */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function buildAttribution(author: string | null, license: string | null): string {
  if (author && license) return `Photo: ${author} / ${license}`
  if (author) return `Photo: ${author}`
  if (license) return `Photo: Wikimedia Commons / ${license}`
  return 'Photo: Wikimedia Commons'
}

/** A thumbnail URL rescaled to another width, when it is a scalable one. */
function rescale(thumbUrl: string, width: number): string | null {
  if (!/\/\d+px-[^/]+$/.test(thumbUrl)) return null
  return thumbUrl.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`)
}

/**
 * One photo per subject, in the order given: the lead image of the article
 * with exactly that title (redirects followed, disambiguation pages skipped).
 * Subjects with no such article, of a kind that is never pictured, or with no
 * usable photograph are left out.
 */
export async function fetchSubjectPhotos(subjects: string[]): Promise<EventPhoto[]> {
  const titles = [...new Set(subjects.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SUBJECTS)
  if (titles.length === 0) return []

  // 1. Each subject's article and the name of its lead image.
  const articles = await query({
    titles: titles.join('|'),
    redirects: '1',
    prop: 'pageimages|pageprops|description',
    piprop: 'name',
    ppprop: 'disambiguation',
  })
  const byTitle = new Map<string, QueryPage>()
  for (const page of Object.values(articles.pages ?? {})) {
    if (page.title) byTitle.set(page.title, page)
  }
  const found: { subject: string; file: string }[] = []
  for (const requested of titles) {
    const page = byTitle.get(resolveTitle(articles, requested))
    if (!page?.title || page.missing !== undefined || page.invalid !== undefined) continue
    if (page.pageprops?.disambiguation !== undefined) continue
    if (page.description && NEVER_PICTURED.test(page.description)) continue
    if (!page.pageimage) continue
    found.push({ subject: page.title, file: `File:${page.pageimage}` })
  }
  if (found.length === 0) return []

  // 2. Those images: a large rendition, size, type and credit.
  const files = await query({
    titles: found.map((f) => f.file).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(WIDTH),
    iiextmetadatafilter: 'Artist|LicenseShortName|UsageTerms',
  })
  const infoByTitle = new Map<string, ImageInfo>()
  for (const page of Object.values(files.pages ?? {})) {
    const info = page.imageinfo?.[0]
    if (page.title && info) infoByTitle.set(page.title, info)
  }

  const photos: EventPhoto[] = []
  for (const { subject, file } of found) {
    const info = infoByTitle.get(resolveTitle(files, file))
    if (!info?.url || !info.mime || !PHOTO_MIME.has(info.mime)) continue
    if ((info.width ?? 0) < MIN_SIDE || (info.height ?? 0) < MIN_SIDE) continue
    const meta = info.extmetadata ?? {}
    const author = meta.Artist?.value ? stripHtml(meta.Artist.value) : null
    const license = meta.LicenseShortName?.value ?? meta.UsageTerms?.value ?? null
    const url = info.thumburl ?? info.url
    photos.push({
      url,
      thumbUrl: rescale(url, THUMB_WIDTH),
      // The caption says who or what is pictured — the reason it is here.
      caption: subject,
      attribution: buildAttribution(author, license),
    })
  }
  return photos
}
