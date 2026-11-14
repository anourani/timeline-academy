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
//     bullets and must render as story-only, exactly as before.

export interface ParsedEventDescription {
  /** Bullet text, markers removed. Empty for an old-style description. */
  summary: string[]
  /** Story paragraphs, in order. */
  paragraphs: string[]
}

// A marker followed by whitespace, or a marker that is the whole line so far
// — the stream often delivers "-" and " First bullet" as separate deltas, and
// the bare marker must not flash up as a one-character paragraph in between.
// `*` and `•` are accepted because models drift from the instruction.
const BULLET = /^\s*[-*•](?:\s+|$)/

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

export function parseEventDescription(
  text: string | null | undefined,
): ParsedEventDescription {
  if (!text) return { summary: [], paragraphs: [] }

  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++

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

  return { summary, paragraphs: splitParagraphs(lines.slice(i).join('\n')) }
}
