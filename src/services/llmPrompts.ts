// Prompts shared by both browser-direct BYOK clients.
//
// The timeline prompts below (getSystemPrompt / getStreamSystemPrompt /
// getUserPrompt) mirror supabase/functions/_shared/prompts.ts — keep those
// identical so the BYOK client and the edge function produce equivalent
// output. Source of truth: _shared/prompts.ts.
//
// The classification and enrichment prompts are NOT part of that mirror:
// CLASSIFICATION_PROMPT is duplicated in _shared/classify.ts, and the enrich
// prompts below are duplicated in supabase/functions/enrich-event/index.ts.
// The prompts are provider-neutral prose — no tool schemas, no provider-
// specific structure — so both direct clients use them unchanged.

import type { EnrichableEvent } from '@/types/event'

export interface CategoryDefinition {
  id: string
  label: string
  promptSnippet: string
}

const PREAMBLE =
  `You are a timeline generator. You receive a subject, category lenses, and their definitions. Your ONLY job is to find events that match the provided categories.`

const HARD_RULES =
  `1. CATEGORY LOCK-IN — Every event MUST belong to one of the provided categories. Never invent or add extra categories.
2. BALANCED DISTRIBUTION — Generate 4–8 events per category. Distribute roughly evenly. If a category has fewer than 2 events, note this in the timeline description.
3. EVENT QUALITY — Max 55 characters per title. Prefer specific facts over vague summaries.
   BAD:  "Had a successful career"
   GOOD: "Scored 81 points vs. Raptors"
4. DATE FORMAT — YYYY-MM-DD, AD years only (never a BC/BCE date). Year-only → January 1. Ranges → use startDate/endDate span. Chronological order.
5. EVENT SPAN — Keep every event inside the subject's own span: for a person, birth to death. Express legacy and influence as events dated within that span, never as one long event reaching into later centuries.
6. CHAPTERS — Also divide the timeline into named chapters: contiguous spans that together cover every event, with no gaps and no overlaps. Aim for 3–5. A chapter is a phase a biographer would name — a stretch someone lived through — not a single season, a single event, or a single achievement. If two adjacent spans describe one arc, make them one chapter and name the arc ("The NFL Years", not "Enters the NFL"). Each chapter's startDate must be the first of a month, each label max 30 characters, named for what happened in that span ("Race to the Moon", not "Chapter 3"). The first chapter starts on or before the earliest event; the last ends on or after the latest.`

export function getSystemPrompt(): string {
  return `${PREAMBLE}

HARD RULES:
${HARD_RULES}
7. JSON ONLY — No markdown, no code fences, no explanation.

RESPONSE SCHEMA:
{
  "timelineTitle": "<descriptive title>",
  "timelineDescription": "<1–2 sentence summary of scope>",
  "categoryMapping": {
    "category_1": "<first category label>",
    "category_2": "<second category label>",
    "category_3": "<third category label>",
    "category_4": "<fourth category label>"
  },
  "chapters": [
    {
      "label": "<max 30 chars>",
      "startDate": "YYYY-MM-01",
      "endDate": "YYYY-MM-DD"
    }
  ],
  "events": [
    {
      "title": "<max 55 chars>",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "category": "category_1"
    }
  ]
}`
}

/**
 * The streaming variant: NDJSON, one object per line.
 *
 * The line order is a contract the UI depends on, not a stylistic preference.
 * `meta.range` fixes the timeline axis before any event exists — without it
 * the axis is derived from the events seen so far, and every earlier-dated
 * event arriving would shift every column already drawn. Chapters land next
 * because they are a table of contents. Events come last, ascending, which is
 * what lets the skeleton recede left to right just ahead of them.
 */
export function getStreamSystemPrompt(): string {
  return `${PREAMBLE}

HARD RULES:
${HARD_RULES}
7. NDJSON ONLY — One JSON object per line. No wrapping array, no markdown, no code fences, no explanation, no blank lines. Each line must be complete and valid JSON on its own.

LINE ORDER — emit in exactly this order:
a) Exactly one "meta" line, FIRST, before anything else.
b) Every "chapter" line.
c) Every "event" line, sorted by startDate ASCENDING (earliest first).
d) Exactly one "done" line, LAST.

"meta".range must span the whole timeline: startYear is the year of the earliest event, endYear the year of the latest. Get this right — it is fixed before the events are read and is not revised afterwards.

RESPONSE FORMAT:
{"type":"meta","title":"<descriptive title>","description":"<1–2 sentence summary of scope>","range":{"startYear":<YYYY>,"endYear":<YYYY>},"categoryMapping":{"category_1":"<first category label>","category_2":"<second category label>","category_3":"<third category label>","category_4":"<fourth category label>"}}
{"type":"chapter","label":"<max 30 chars>","startDate":"YYYY-MM-01","endDate":"YYYY-MM-DD"}
{"type":"event","title":"<max 55 chars>","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","category":"category_1"}
{"type":"done"}`
}

export function getUserPrompt(
  subject: string,
  categories?: CategoryDefinition[],
): string {
  if (!categories || categories.length === 0) {
    return `Generate a biographical timeline for: ${subject}`
  }

  const categoryLines = categories
    .map((c, i) => `- category_${i + 1}: "${c.label}" → ${c.promptSnippet}`)
    .join('\n')

  return `Generate a timeline of: ${subject}

Category lenses (use ONLY these):
${categoryLines}`
}

// Classification prompt mirror — used by anthropicDirect for the classify step.
export const CLASSIFICATION_PROMPT = `Classify the following subject into exactly one type.
Types:
- "person" — an individual human (living or dead)
- "event" — a bounded historical occurrence with a beginning and end
- "topic" — a broad concept, movement, genre, or field of study
- "organization" — a company, band, institution, team, or formal group

Subject: "{subject}"

Return ONLY valid JSON: {"type": "<type>"}`

// ---------------------------------------------------------------------------
// Event enrichment — mirrors supabase/functions/enrich-event/index.ts
// ---------------------------------------------------------------------------

export const ENRICH_SYSTEM_PROMPT = `You are writing a 1-2 paragraph description of a historical event for an educational timeline. Use the web_search tool to find authoritative sources before writing. Keep the description concise (max ~150 words for simple events, two short paragraphs for complex ones). Use a neutral encyclopedic tone. Do not include inline citations or footnotes — sources are listed separately. Do not invent facts that aren't in the search results.`

export function buildEnrichUserPrompt(
  event: EnrichableEvent,
  timelineTitle: string,
): string {
  const lines: string[] = []
  lines.push(`Write a description for this event: "${event.title}"`)
  if (event.startDate || event.endDate) {
    if (event.startDate && event.endDate && event.startDate !== event.endDate) {
      lines.push(`Date range: ${event.startDate} to ${event.endDate}`)
    } else if (event.startDate) {
      lines.push(`Date: ${event.startDate}`)
    }
  }
  if (timelineTitle) lines.push(`Timeline context: ${timelineTitle}`)
  lines.push(
    'Use the web_search tool to find sources, then write the description. Output only the description text — no headings, no source lists.',
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// World Events — mirrors supabase/functions/world-events/index.ts
// ---------------------------------------------------------------------------
//
// Context events for the lane under a timeline: what else was happening in a
// country, the world, or science and technology across the timeline's span.
// Like the enrich prompts, this pair is duplicated by hand in the edge
// function rather than shared — keep the two identical.

export type WorldEventsPromptSource = 'country' | 'world' | 'science'

export const WORLD_EVENTS_SYSTEM_PROMPT = `You choose context events for an educational timeline's "World Events" lane. The lane sits under one specific timeline and shows what else was happening that matters TO THAT TIMELINE. It is not a list of the period's most important history.

WHAT MAKES THE CUT — an event qualifies only if one of these is true:
A. It directly shaped or touched the timeline's subject: their life, work, field, industry, country, rivals or audience.
B. It is an era-defining event that any reader would recognize as the backdrop of the period — a world war, a great depression, a pandemic, a revolution that remade the subject's country. B applies to world and country events only, never to science and technology.

For science and technology, be strictest: include only developments in or next to the subject's own field, or ones the subject plausibly knew of, competed with, built on or was affected by.
  BAD (Nikola Tesla timeline): "Insulin first used to treat diabetes" — important to the world, irrelevant to Tesla.
  GOOD (Nikola Tesla timeline): "Edison opens Pearl Street Station" — his field, his rival.

Fewer is better. Never pad a list to reach the maximum. Returning only one to three events, or none, is correct when that is all that qualifies.

HARD RULES:
1. Only real, well-documented events with a dedicated English Wikipedia article. Never invent an event or a date. If you are unsure of a date, leave the event out.
2. Every event must start and end within the requested year range.
3. Never include events about the subject itself — those belong in the timeline, not in this lane.
4. Titles: max 40 characters, specific and recognizable ("Fall of the Berlin Wall", not "Political change in Europe").
5. DATE FORMAT — YYYY-MM-DD, AD years only. Year-only → January 1. A single-day event has endDate equal to startDate.
6. "wikipedia" is the exact title of the event's English Wikipedia article. Dates are checked against it, and an event whose article cannot be found is discarded.
7. "why" is a short clause naming the connection to this timeline (rule A) or the era it defines (rule B).
8. JSON ONLY — no markdown, no code fences, no explanation. Reply with exactly one object:
{"events":[{"title":"...","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","wikipedia":"...","why":"..."}]}`

export interface WorldEventsPromptInput {
  source: WorldEventsPromptSource
  /** Display name of the country; only used when `source` is 'country'. */
  countryName?: string
  startYear: number
  endYear: number
  /** The timeline's subject — what every pick is judged against. */
  subject?: string
  /** The timeline's own description, when it has one. */
  description?: string
  /** A spread of the timeline's own events, as "YYYY · Title". */
  highlights?: string[]
  maxEvents: number
}

export function buildWorldEventsUserPrompt(input: WorldEventsPromptInput): string {
  const lines: string[] = []
  if (input.source === 'country') {
    lines.push(
      `Source: the national history of ${input.countryName || 'the United States'} — politics, wars, laws, elections, disasters and social change.`,
    )
  } else if (input.source === 'world') {
    lines.push(
      'Source: world events — wars, treaties, revolutions, pandemics and other global turning points.',
    )
  } else {
    lines.push(
      'Source: science and technology — inventions, discoveries, launches and breakthroughs.',
    )
  }
  lines.push(`Year range: ${input.startYear} to ${input.endYear}.`)
  lines.push(`Return at most ${input.maxEvents} events, and fewer if fewer qualify.`)
  lines.push('')
  lines.push(`The timeline is about: "${input.subject || 'an unnamed subject'}".`)
  if (input.description) lines.push(`Its description: ${input.description}`)
  if (input.highlights && input.highlights.length > 0) {
    lines.push("Some of the timeline's own events, to show what it covers:")
    for (const h of input.highlights) lines.push(`- ${h}`)
  }
  return lines.join('\n')
}
