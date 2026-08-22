// Prompts shared by both browser-direct BYOK clients.
//
// The timeline prompts below (getSystemPrompt / getUserPrompt) mirror
// supabase/functions/_shared/prompts.ts — keep those identical so the BYOK
// client and the edge function produce equivalent output. Source of truth:
// _shared/prompts.ts.
//
// The classification and enrichment prompts are NOT part of that mirror:
// CLASSIFICATION_PROMPT is duplicated in _shared/classify.ts, and the enrich
// prompts below are duplicated in supabase/functions/enrich-event/index.ts.
// The prompts are provider-neutral prose — no tool schemas, no provider-
// specific structure — so both direct clients use them unchanged.

import type { TimelineEvent } from '@/types/event'

export interface CategoryDefinition {
  id: string
  label: string
  promptSnippet: string
}

export function getSystemPrompt(): string {
  return `You are a timeline generator. You receive a subject, category lenses, and their definitions. Your ONLY job is to find events that match the provided categories.

HARD RULES:
1. CATEGORY LOCK-IN — Every event MUST belong to one of the provided categories. Never invent or add extra categories.
2. BALANCED DISTRIBUTION — Generate 4–8 events per category. Distribute roughly evenly. If a category has fewer than 2 events, note this in the timeline description.
3. EVENT QUALITY — Max 55 characters per title. Prefer specific facts over vague summaries.
   BAD:  "Had a successful career"
   GOOD: "Scored 81 points vs. Raptors"
4. DATE FORMAT — YYYY-MM-DD, AD years only (never a BC/BCE date). Year-only → January 1. Ranges → use startDate/endDate span. Chronological order.
5. EVENT SPAN — Keep every event inside the subject's own span: for a person, birth to death. Express legacy and influence as events dated within that span, never as one long event reaching into later centuries.
6. JSON ONLY — No markdown, no code fences, no explanation.

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
  event: TimelineEvent,
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
