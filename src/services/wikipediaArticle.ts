// Matching Wikipedia articles to events, for the event view's photos
// (wikipediaPhotos.ts decides which pictures are shown).
//
// Photos used to come from "search Wikipedia for the event's title, take the
// top hit, show its images". Two things went wrong. Event titles read like
// sentences, and full-text search ranks whatever page shares the most words:
// "Launches CUDA, opening GPUs to general computing" came back as "Blender
// (software)". And when the article was right but broad — the subject's own
// biography for "Marries Lori Huang" — its images were of decades of other
// things. So this file answers narrower questions: is a name the timeline's
// own subject, and is an article about the event itself.

import type { EventSource } from '@/types/event'

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
 * at least three characters (or a number: the "11" of "Apollo 11"), not a
 * stopword, with a trailing plural "s"
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
    .filter((w) => (w.length >= 3 || /^\d+$/.test(w)) && !STOPWORDS.has(w))
  return new Set(words)
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
 * Is this name the timeline's own subject — "Jensen Huang" on a timeline
 * titled "Jensen Huang"? Every identifying word of the name must be in the
 * timeline's title. Used to keep the subject out of the photos of events that
 * are about someone or something else in their life.
 */
export function isTimelineSubject(name: string, timelineTitle?: string): boolean {
  const words = keywords(name)
  if (words.size === 0) return false
  const timeline = keywords(timelineTitle ?? '')
  for (const word of words) if (!timeline.has(word)) return false
  return true
}

/**
 * Is this article about the event itself, rather than about the timeline's
 * subject? It must share a word with the event's title that is not also a
 * word of the timeline's title: "CUDA" for "Launches CUDA…" on a Jensen Huang
 * timeline, but not "Jensen Huang" for "Marries Lori Huang", which only
 * matches on the surname.
 */
export function isAboutEvent(
  articleTitle: string,
  eventTitle: string,
  timelineTitle?: string,
): boolean {
  const timeline = keywords(timelineTitle ?? '')
  const article = keywords(articleTitle)
  const event = keywords(eventTitle)
  // The event is named exactly as the article is.
  if (article.size > 0 && article.size === event.size && [...article].every((w) => event.has(w))) {
    return true
  }
  for (const word of event) {
    if (!timeline.has(word) && article.has(word)) return true
  }
  return false
}

/**
 * Which subjects an event's photos may show, strictest reading: something
 * else — never the timeline's own subject — that the event's *title itself*
 * names. "Marries Lori Huang" names Lori; "Launches CUDA…" names CUDA.
 *
 * Candidates are the description's `Pictured:` names; for descriptions
 * written before that line existed, its `Who:` names and the Wikipedia
 * article the model cited. Being a candidate is not enough: the model has
 * pictured the subject's own portrait on events about him, and his company's
 * headquarters on an award — so every candidate, whatever its source, must
 * pass both checks here. An empty result means no photos, which is the right
 * answer for most events.
 */
export function photoSubjects({
  eventTitle,
  timelineTitle,
  pictured,
  who,
  citedArticle,
}: {
  eventTitle: string
  timelineTitle?: string
  /** The `Pictured:` fact line, " | "-separated; undefined when absent. */
  pictured?: string
  /** The `Who:` fact line. */
  who?: string
  citedArticle?: string | null
}): string[] {
  const split = (text: string | undefined) =>
    (text ?? '')
      .split(/[|,;]/)
      .map((s) => s.trim())
      .filter(Boolean)

  const candidates =
    pictured !== undefined ? split(pictured) : [...split(who), ...(citedArticle ? [citedArticle] : [])]

  const subjects: string[] = []
  const seen = new Set<string>()
  for (const name of candidates) {
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (isTimelineSubject(name, timelineTitle)) continue
    if (!isAboutEvent(name, eventTitle, timelineTitle)) continue
    subjects.push(name)
  }
  return subjects
}
