// Browser-direct mirror of supabase/functions/_shared/prompts.ts.
// Keep these two files identical so the BYOK client and the edge function
// produce equivalent outputs. Source of truth: _shared/prompts.ts.

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
4. DATE FORMAT — YYYY-MM-DD. Year-only → January 1. Ranges → use startDate/endDate span. Chronological order.
5. JSON ONLY — No markdown, no code fences, no explanation.

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
