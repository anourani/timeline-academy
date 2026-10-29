// World Events: context events for the read-only lane under a timeline.
//
// Lists what else was happening — in one country's national history, in the
// world at large, or in science and technology — across the timeline's year
// range. Plain JSON in, plain JSON out (no streaming): the reply is a short,
// bounded list the client renders all at once.
//
// Request:  { source: 'country'|'world'|'science', country?: string,
//             startYear: number, endYear: number, subject?: string,
//             description?: string, highlights?: string[], maxEvents?: number }
// Response: { events: [{ title, startDate, endDate, wikipedia? }] }
//           (dates YYYY-MM-DD; the client fact-checks them against the
//           named Wikipedia article before showing anything)
//
// The model is pinned server-side. This function never reads a `model` field
// from the body, so a caller cannot choose what our key pays for.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { checkRateLimit, recordUsage } from "../_shared/rate-limiter.ts";

type WorldEventsSource = "country" | "world" | "science";

const SOURCES: readonly WorldEventsSource[] = ["country", "world", "science"];

interface WorldEventsRequest {
  source?: unknown;
  country?: unknown;
  startYear?: unknown;
  endYear?: unknown;
  subject?: unknown;
  // Added with the relevance-first prompt. Optional: a site deployed before
  // them simply doesn't send them, and the prompt falls back to the subject.
  description?: unknown;
  highlights?: unknown;
  maxEvents?: unknown;
}

interface WorldEventItem {
  title: string;
  startDate: string;
  endDate: string;
  /** The model's claimed article; the client fact-checks dates against it. */
  wikipedia?: string;
}

const MIN_YEAR = 1;
const MAX_YEAR = 2100;
const MAX_SUBJECT_LENGTH = 200;
const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_HIGHLIGHTS = 20;
const MAX_HIGHLIGHT_LENGTH = 120;
const MAX_ARTICLE_LENGTH = 250;
const MIN_EVENTS = 3;
const MAX_EVENTS = 30;
const DEFAULT_EVENTS = 12;
const DEFAULT_COUNTRY = "US";

// Each lane source is its own request, and a lane refetches when the
// timeline's range or sources change, so this sits with enrichment rather
// than with generation.
const WORLD_EVENTS_RATE_LIMIT = 30;

const GENERIC_ERROR = "Couldn't load world events.";

// ---------------------------------------------------------------------------
// Prompts — a hand-maintained mirror of the World Events section at the
// bottom of src/services/llmPrompts.ts (used by the browser-direct BYOK path).
// The two MUST stay identical: edit one, edit the other in the same change.
// Kept in that file's formatting (no semicolons, single quotes) so the two
// copies diff cleanly against each other.
// ---------------------------------------------------------------------------

type WorldEventsPromptSource = 'country' | 'world' | 'science'

const WORLD_EVENTS_SYSTEM_PROMPT = `You choose context events for an educational timeline's "World Events" lane. The lane sits under one specific timeline and shows what else was happening that matters TO THAT TIMELINE. It is not a list of the period's most important history.

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

interface WorldEventsPromptInput {
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

function buildWorldEventsUserPrompt(input: WorldEventsPromptInput): string {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isYear(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_YEAR &&
    value <= MAX_YEAR
  );
}

function clampMaxEvents(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_EVENTS;
  }
  return Math.min(MAX_EVENTS, Math.max(MIN_EVENTS, Math.round(value)));
}

function cappedSubject(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_SUBJECT_LENGTH);
}

function cappedDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_DESCRIPTION_LENGTH) : undefined;
}

// Malformed context is dropped, never a 400: it only sharpens relevance.
function cappedHighlights(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((h): h is string => typeof h === "string" && h.trim() !== "")
    .slice(0, MAX_HIGHLIGHTS)
    .map((h) => h.trim().slice(0, MAX_HIGHLIGHT_LENGTH));
  return out.length > 0 ? out : undefined;
}

function countryDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The regex alone admits 2020-13-45, which would land on the client as an
// Invalid Date. Check the calendar too.
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(2000, m, 0)).getUTCDate();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const max = m === 2 ? (leap ? 29 : 28) : daysInMonth;
  return d <= max;
}

function yearStart(year: number): string {
  return `${String(year).padStart(4, "0")}-01-01`;
}

function yearEnd(year: number): string {
  return `${String(year).padStart(4, "0")}-12-31`;
}

/**
 * Returns null when the reply is not usable at all (not JSON, no `events`
 * array). An array whose items are all invalid yields an empty list instead —
 * that is a real, if unhelpful, answer.
 */
function parseEvents(
  raw: string,
  startYear: number,
  endYear: number,
  maxEvents: number,
): WorldEventItem[] | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const items = (parsed as Record<string, unknown>).events;
  if (!Array.isArray(items)) return null;

  const lo = yearStart(startYear);
  const hi = yearEnd(endYear);
  const events: WorldEventItem[] = [];

  for (const item of items) {
    if (events.length >= maxEvents) break;
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;

    if (typeof e.title !== "string") continue;
    const title = e.title.trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) continue;

    if (!isIsoDate(e.startDate)) continue;
    let startDate = e.startDate;
    let endDate = isIsoDate(e.endDate) ? e.endDate : startDate;
    if (endDate < startDate) [startDate, endDate] = [endDate, startDate];

    // YYYY-MM-DD with a four-digit year compares correctly as a string.
    if (startDate < lo || endDate > hi) continue;

    const wikipedia =
      typeof e.wikipedia === "string"
        ? e.wikipedia.trim().slice(0, MAX_ARTICLE_LENGTH)
        : "";
    events.push({ title, startDate, endDate, ...(wikipedia ? { wikipedia } : {}) });
  }

  return events;
}

async function authenticateUser(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Every server-funded AI call requires a signed-in user. Anonymous visitors
  // with their own key call the provider browser-direct instead.
  const userId = await authenticateUser(req);
  if (!userId) {
    return json({ error: "Sign in to load world events." }, 401);
  }
  const sessionKey = `world:user:${userId}`;

  const { allowed } = await checkRateLimit(sessionKey, WORLD_EVENTS_RATE_LIMIT);
  if (!allowed) {
    return json(
      {
        error:
          "You've reached the daily limit for world events. Please try again tomorrow.",
      },
      429
    );
  }

  let body: WorldEventsRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const source = body.source;
  if (typeof source !== "string" || !SOURCES.includes(source as WorldEventsSource)) {
    return json({ error: "Invalid source." }, 400);
  }

  const { startYear, endYear } = body;
  if (!isYear(startYear) || !isYear(endYear) || startYear > endYear) {
    return json({ error: "Invalid year range." }, 400);
  }

  let countryName: string | undefined;
  if (source === "country") {
    const code = body.country === undefined || body.country === null || body.country === ""
      ? DEFAULT_COUNTRY
      : body.country;
    if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code)) {
      return json({ error: "Invalid country." }, 400);
    }
    countryName = countryDisplayName(code);
  }

  const maxEvents = clampMaxEvents(body.maxEvents);

  const userPrompt = buildWorldEventsUserPrompt({
    source: source as WorldEventsSource,
    countryName,
    startYear,
    endYear,
    subject: cappedSubject(body.subject),
    description: cappedDescription(body.description),
    highlights: cappedHighlights(body.highlights),
    maxEvents,
  });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not configured.");
    return json({ error: "World events are temporarily unavailable." }, 500);
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Server-funded pin, same as generate-timeline and enrich-event.
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: WORLD_EVENTS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        // Thinking off: a fixed JSON schema with no tools, and Sonnet 5
        // otherwise spends part of the same max_tokens budget reasoning.
        // No `temperature`: Sonnet 5 rejects a non-default value.
        thinking: { type: "disabled" },
      }),
    });

    if (!anthropicRes.ok) {
      // Provider error bodies can carry account details — log server-side,
      // send only a generic message to the caller.
      const errText = await anthropicRes.text().catch(() => "");
      console.error(
        `Anthropic API error (${anthropicRes.status}): ${errText.slice(0, 500)}`
      );
      return json({ error: GENERIC_ERROR }, 502);
    }

    const message = await anthropicRes.json();

    const stopReason = message?.stop_reason;
    if (stopReason === "refusal" || stopReason === "max_tokens") {
      console.error(`world-events: unusable stop_reason "${stopReason}"`);
      return json({ error: GENERIC_ERROR }, 502);
    }

    // Text blocks only — never thinking or any other block type.
    const blocks = Array.isArray(message?.content) ? message.content : [];
    const text = blocks
      .filter(
        (b: Record<string, unknown>) =>
          b?.type === "text" && typeof b.text === "string"
      )
      .map((b: Record<string, unknown>) => b.text as string)
      .join("");

    const events = parseEvents(text, startYear, endYear, maxEvents);
    if (events === null) {
      console.error(
        `world-events: unparseable reply: ${text.slice(0, 500)}`
      );
      return json({ error: GENERIC_ERROR }, 502);
    }

    // Only a delivered answer counts against the daily budget. Awaited, like
    // recordUsage's own cleanup: the isolate may not finish detached work.
    await recordUsage(sessionKey).catch(() => {});

    return json({ events }, 200);
  } catch (err) {
    console.error("world-events error:", err);
    return json({ error: GENERIC_ERROR }, 502);
  }
});
