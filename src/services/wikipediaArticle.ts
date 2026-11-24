// Which Wikipedia article an event's photos come from.
//
// This used to be "search Wikipedia for the event's title and take the top
// hit". Event titles read like sentences, not article names, and full-text
// search ranks whatever page shares the most words: "Launches CUDA, opening
// GPUs to general computing" came back as "Blender (software)", and the event
// view showed six pictures of Blender. Two rules replace it:
//
//   1. Prefer an article we already have good reason to trust: the English
//      Wikipedia page among the sources the model cited for the event, or the
//      article a World Events entry was fact-checked against.
//   2. Otherwise search, but only accept a result whose title shares a real
//      word with the event's title or the timeline's. No match, no article —
//      and no photos, which is better than unrelated ones.

import type { EventSource } from '@/types/event'

const SEARCH = 'https://en.wikipedia.org/w/rest.php/v1/search/page'
const SEARCH_LIMIT = 5

/** Pages in these namespaces are never an event's article. */
const NON_ARTICLE = /^(file|image|special|category|help|wikipedia|talk|template|portal|user|draft|module|mediawiki):/i

/** Words that say nothing about which article is meant. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'onto', 'over', 'under', 'after',
  'before', 'its', 'his', 'her', 'their', 'our', 'this', 'that', 'these', 'those',
  'was', 'were', 'are', 'has', 'had', 'have', 'been', 'being', 'via', 'about',
  'first', 'new', 'begins', 'begin', 'ends', 'end', 'starts', 'start', 'launch',
  'open', 'opening', 'become', 'join', 'leave', 'move', 'win', 'announce',
  'release', 'found', 'founded', 'during', 'between', 'against',
])

/**
 * The words of a title that identify something: lower-cased, accents removed,
 * at least three characters, not a stopword, with a trailing plural "s"
 * dropped so "GPUs" meets "GPU". A parenthesised qualifier — the "(software)"
 * in "Blender (software)" — is ignored: it is a category, not the subject.
 */
function keywords(title: string): Set<string> {
  const words = title
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => (/(ch|sh|x|z)es$/.test(w) ? w.slice(0, -2) : w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    // After the plural is dropped, so "launches" meets the stopword "launch".
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  return new Set(words)
}

/** Does this article title share an identifying word with the event or its timeline? */
export function isRelevantArticle(
  articleTitle: string,
  eventTitle: string,
  timelineTitle?: string,
): boolean {
  const article = keywords(articleTitle)
  if (article.size === 0) return false
  const wanted = new Set([...keywords(eventTitle), ...keywords(timelineTitle ?? '')])
  for (const word of article) if (wanted.has(word)) return true
  return false
}

/**
 * The English Wikipedia article among an event's cited sources, if there is
 * one. Only en.wikipedia.org: it is the one Wikipedia host `connect-src`
 * allows, and the photo lookup asks it about the article.
 */
export function articleFromSources(sources: EventSource[] | null | undefined): string | null {
  for (const source of sources ?? []) {
    let url: URL
    try {
      url = new URL(source.url)
    } catch {
      continue
    }
    if (url.hostname !== 'en.wikipedia.org' && url.hostname !== 'en.m.wikipedia.org') continue
    if (!url.pathname.startsWith('/wiki/')) continue
    let title: string
    try {
      title = decodeURIComponent(url.pathname.slice('/wiki/'.length))
    } catch {
      continue
    }
    title = title.replace(/_/g, ' ').trim()
    if (!title || NON_ARTICLE.test(title)) continue
    return title
  }
  return null
}

/**
 * The first of Wikipedia's top search results for the event that passes the
 * relevance check, or null when none does. Throws on a network failure, so a
 * caller can tell "nothing relevant" from "could not ask".
 */
export async function searchRelevantArticle(
  eventTitle: string,
  timelineTitle?: string,
): Promise<string | null> {
  const query = eventTitle.trim()
  if (!query) return null
  const res = await fetch(`${SEARCH}?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`)
  if (!res.ok) throw new Error(`Wikipedia search failed: ${res.status}`)
  const json = await res.json()
  const pages: { title?: unknown }[] = Array.isArray(json?.pages) ? json.pages : []
  for (const page of pages) {
    if (typeof page.title !== 'string') continue
    if (isRelevantArticle(page.title, query, timelineTitle)) return page.title
  }
  return null
}
