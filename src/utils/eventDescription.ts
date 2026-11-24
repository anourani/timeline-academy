// The event detail panel's description format.
//
// An enriched event's `description` is one string, stored in
// `events.description` (and on drafts and the viewer cache) exactly as the
// model streamed it. Since Nov 2026 the prompt asks for a short bullet
// summary first, then the description as plain paragraphs:
//
//   - One-sentence bullet.
//   - Another bullet.
//
//   First paragraph of the story.
//
//   Second paragraph, only if the event warrants one.
//
//   Where: Paris, in a converted shed at the School of Physics and Chemistry
//   Who: Marie Curie, Pierre Curie
//   Age: 30
//
// The trailing fact lines (Nov 2026, the event view's At a glance list) are
// each optional. They come last, not first, for deploy skew: an old cached
// site meeting a new function shows them as one short closing paragraph,
// where at the top they would have pushed the summary into the story. See
// docs/2026-11-24-event-view-prd.md §6.
//
// The summary lives inside the existing column rather than its own on
// purpose — no migration to forget to apply, and drafts, the viewer cache and
// both save paths carry it for free. See
// docs/2026-11-08-event-panel-tldr-plan.md §3.
//
// So this parser is the only thing that knows the format, and it must accept
// every shape a description can arrive in:
//   - the new shape, complete;
//   - the new shape mid-stream (bullets with no story yet, or a bullet that
//     is still being written, or just the opening "-");
//   - the old shape — descriptions written before the prompt changed, or by
//     an edge function the site has outrun (deploy skew) — which has no
//     bullets and must render as story-only, exactly as before;
//   - fact lines mid-stream: a half-written key ("Wh", "Age:") must not flash
//     up as a paragraph of its own.

export interface EventFacts {
  where?: string
  who?: string
  age?: string
}

export interface ParsedEventDescription {
  /** Bullet text, markers removed. Empty for an old-style description. */
  summary: string[]
  /** Story paragraphs, in order. */
  paragraphs: string[]
  /** The At a glance fact lines. Empty for anything written before them. */
  facts: EventFacts
}

// A marker followed by whitespace, or a marker that is the whole line so far
// — the stream often delivers "-" and " First bullet" as separate deltas, and
// the bare marker must not flash up as a one-character paragraph in between.
// `*` and `•` are accepted because models drift from the instruction.
const BULLET = /^\s*[-*•](?:\s+|$)/

/** A complete fact line. Only these three keys; anything else stays story. */
const FACT = /^\s*(where|who|age)\s*:\s*(.*)$/i

/** A fact line still being streamed: a prefix of a key, with or without its colon. */
const FACT_PARTIAL = /^\s*(w|wh|whe|wher|where|who|a|ag|age)\s*:?\s*$/i

/**
 * First-person narration the model writes before (or between) its web
 * searches — "I'll research this event before writing." The answer is meant
 * to start at the first bullet, and the prompt asks for a neutral
 * encyclopedic tone, so a first-person sentence at the very start is never
 * the description. Text blocks either side of a search are streamed with
 * nothing between them, so it usually arrives glued to the first bullet
 * ("…before writing.- In 1973…"): the sentence ends at its punctuation, or
 * at the end of the text while it is still streaming.
 */
const PREAMBLE =
  /^\s*(?:(?:okay|ok|sure|alright|great|now)[,.!]?\s+)?(?:I'll|I will|I'm going to|I am going to|I need to|I'm|I am|I have|I've|Let me|Let's|First,?\s+(?:I'll|let me))\b[^\n]*?(?:[.!?:…]+(?=\s|[-*•]|[A-Z]|$)|$)/i

/** A short lead-in glued to the first bullet: "Here is the summary:- In 1973…". */
const GLUED_LEAD_IN = /^\s*[^\n]{1,200}?[.!?:]\s*([-*•]\s+[^\n]*)$/

/** Drop the model's narration ahead of the answer, however many sentences of it. */
function stripPreamble(text: string): string {
  let out = text
  for (let guard = 0; guard < 5; guard++) {
    const m = out.match(PREAMBLE)
    if (!m || m[0].length === 0) break
    out = out.slice(m[0].length)
  }
  return out
}

/** Bold markers are the one bit of markdown models add unasked. */
function clean(text: string): string {
  return text.replace(/\*\*/g, '').trim()
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(clean)
    .filter((p) => p.length > 0)
}

/**
 * Pull a trailing block of fact lines off the end of the text. The block must
 * be the last one (after a blank line, or the whole text) and consist only of
 * fact lines — so a story paragraph that happens to begin "Who…" is left
 * alone. The last line may be a key still being written.
 */
function takeFacts(lines: string[]): { rest: string[]; facts: EventFacts } {
  const facts: EventFacts = {}
  let end = lines.length
  while (end > 0 && lines[end - 1].trim() === '') end--
  let start = end
  while (start > 0 && lines[start - 1].trim() !== '') start--
  if (start === end) return { rest: lines, facts }

  // Bold is stripped before matching: "**Where:** Paris" is still a fact line.
  const block = lines.slice(start, end).map((line) => line.replace(/\*\*/g, ''))
  const isFacts = block.every(
    (line, i) => FACT.test(line) || (i === block.length - 1 && FACT_PARTIAL.test(line)),
  )
  // A lone partial line with nothing before it is just as likely the first
  // word of the story ("A Saturn V…"), and the story wins.
  if (!isFacts || (block.length === 1 && !FACT.test(block[0]) && start === 0)) {
    return { rest: lines, facts }
  }

  for (const line of block) {
    const m = line.match(FACT)
    if (!m) continue
    const value = clean(m[2])
    if (!value) continue
    const key = m[1].toLowerCase() as keyof EventFacts
    if (!facts[key]) facts[key] = value
  }
  return { rest: lines.slice(0, start), facts }
}

export function parseEventDescription(
  text: string | null | undefined,
): ParsedEventDescription {
  if (!text) return { summary: [], paragraphs: [], facts: {} }

  const { rest: lines, facts } = takeFacts(
    stripPreamble(text.replace(/\r\n?/g, '\n')).split('\n'),
  )
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++

  // A short line that is not a bullet, directly ahead of the bullets, is a
  // lead-in ("Here's what I found:") rather than the story — drop it, whether
  // it sits on its own line or is glued to the first bullet.
  if (i < lines.length && !BULLET.test(lines[i])) {
    let next = i + 1
    while (next < lines.length && lines[next].trim() === '') next++
    const bulletsFollow = next < lines.length && BULLET.test(lines[next])
    const glued = lines[i].match(GLUED_LEAD_IN)
    if (glued && (bulletsFollow || next >= lines.length)) {
      lines[i] = glued[1]
    } else if (bulletsFollow && lines[i].trim().length <= 200) {
      i = next
    }
  }

  const summary: string[] = []
  for (; i < lines.length; i++) {
    const line = lines[i]
    // The summary ends at the first line that is not a bullet: a blank line
    // as instructed, or — if the model forgot the blank line — the first
    // line of the story itself. Not treated as a wrapped bullet: models
    // don't hard-wrap, and gluing a paragraph onto the last bullet is the
    // worse failure.
    if (!BULLET.test(line)) break
    const item = clean(line.replace(BULLET, ''))
    if (item) summary.push(item)
  }

  return { summary, paragraphs: splitParagraphs(lines.slice(i).join('\n')), facts }
}
