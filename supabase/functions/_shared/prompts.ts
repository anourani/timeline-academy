/**
 * Prompt templates for AI timeline generation.
 *
 * The new Madlibs system sends subject type and category definitions
 * so the LLM produces focused, well-distributed timelines.
 *
 * Two output shapes, one set of rules. `getSystemPrompt` asks for a single
 * JSON document; `getStreamSystemPrompt` asks for NDJSON so the editor can
 * render each line as it arrives. Rules 1-6 are identical and live in
 * `HARD_RULES` — only rule 7 and the schema differ, which is the whole point
 * of splitting them out: a rule fixed in one shape is fixed in both.
 *
 * `getSystemPrompt`'s output must stay byte-identical. Bundles cached from an
 * earlier deploy still take the non-streaming path, and the two deploy
 * pipelines (Netlify, GitHub Actions) finish at different times.
 */

export interface CategoryDefinition {
  id: string;
  label: string;
  promptSnippet: string;
}

const PREAMBLE =
  `You are a timeline generator. You receive a subject, category lenses, and their definitions. Your ONLY job is to find events that match the provided categories.`;

const HARD_RULES =
  `1. CATEGORY LOCK-IN — Every event MUST belong to one of the provided categories. Never invent or add extra categories.
2. BALANCED DISTRIBUTION — Generate 4–8 events per category. Distribute roughly evenly. If a category has fewer than 2 events, note this in the timeline description.
3. EVENT QUALITY — Max 55 characters per title. Prefer specific facts over vague summaries.
   BAD:  "Had a successful career"
   GOOD: "Scored 81 points vs. Raptors"
4. DATE FORMAT — YYYY-MM-DD, AD years only (never a BC/BCE date). Year-only → January 1. Ranges → use startDate/endDate span. Chronological order.
5. EVENT SPAN — Keep every event inside the subject's own span: for a person, birth to death. Express legacy and influence as events dated within that span, never as one long event reaching into later centuries.
6. CHAPTERS — Also divide the timeline into named chapters: contiguous spans that together cover every event, with no gaps and no overlaps. Aim for 3–5. A chapter is a phase a biographer would name — a stretch someone lived through — not a single season, a single event, or a single achievement. If two adjacent spans describe one arc, make them one chapter and name the arc ("The NFL Years", not "Enters the NFL"). Each chapter's startDate must be the first of a month, each label max 30 characters, named for what happened in that span ("Race to the Moon", not "Chapter 3"). The first chapter starts on or before the earliest event; the last ends on or after the latest.`;

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
}`;
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
{"type":"done"}`;
}

export function getUserPrompt(
  subject: string,
  categories?: CategoryDefinition[]
): string {
  if (!categories || categories.length === 0) {
    return `Generate a biographical timeline for: ${subject}`;
  }

  const categoryLines = categories
    .map(
      (c, i) => `- category_${i + 1}: "${c.label}" → ${c.promptSnippet}`
    )
    .join("\n");

  return `Generate a timeline of: ${subject}

Category lenses (use ONLY these):
${categoryLines}`;
}
