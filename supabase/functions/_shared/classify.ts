/**
 * Subject classification logic.
 *
 * Classifies a subject into one of: person, event, topic, organization.
 * Uses the cheapest/fastest model available for ~100ms response.
 */

const CLASSIFICATION_PROMPT = `Classify the following subject into exactly one type.
Types:
- "person" — an individual human (living or dead)
- "event" — a bounded historical occurrence with a beginning and end
- "topic" — a broad concept, movement, genre, or field of study
- "organization" — a company, band, institution, team, or formal group

Subject: "{subject}"

Return ONLY valid JSON: {"type": "<type>"}`;

const VALID_TYPES = new Set(["person", "event", "topic", "organization"]);

async function classifyWithClaude(
  apiKey: string,
  subject: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      // Alias, not a dated snapshot — the ID is complete as written.
      // Haiku 4.5 still supports assistant prefill and `temperature`; the
      // Sonnet-tier models reject both, so this call must stay on Haiku
      // unless the prefill below is replaced with structured output.
      model: "claude-haiku-4-5",
      max_tokens: 32,
      messages: [
        {
          role: "user",
          content: CLASSIFICATION_PROMPT.replace("{subject}", subject),
        },
        { role: "assistant", content: '{"type": "' },
      ],
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${body}`);
  }

  const json = await res.json();
  const block = json.content?.[0];
  if (!block || block.type !== "text") {
    throw new Error("Empty response from Anthropic");
  }

  // We prefilled with '{"type": "' so the response continues from there
  const text = '{"type": "' + block.text;
  let parsed: { type: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("LLM returned invalid JSON for classification");
  }

  return VALID_TYPES.has(parsed.type) ? parsed.type : "topic";
}

async function classifyWithOpenAI(
  apiKey: string,
  subject: string
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // Cheapest tier of the current family. NOTE: this path is only reached
      // when ANTHROPIC_API_KEY is unset, so it is rarely exercised — confirm
      // the parameter contract against live OpenAI docs before relying on it
      // (reasoning-capable models have historically renamed `max_tokens` and
      // tightened sampling parameters).
      model: "gpt-5.6-luna",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: CLASSIFICATION_PROMPT.replace("{subject}", subject),
        },
      ],
      // No `temperature`: newer reasoning-capable models reject non-default
      // sampling parameters, and it bought nothing on a four-way enum.
      max_tokens: 32,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${body}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from OpenAI");

  let parsed: { type: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("LLM returned invalid JSON for classification");
  }

  return VALID_TYPES.has(parsed.type) ? parsed.type : "topic";
}

/**
 * Classify a subject string into a type using the cheapest available LLM.
 * Falls back to "topic" if the returned type is unexpected.
 */
export async function classifySubject(subject: string): Promise<string> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (anthropicKey) {
    return classifyWithClaude(anthropicKey, subject);
  } else if (openaiKey) {
    return classifyWithOpenAI(openaiKey, subject);
  } else {
    throw new Error("No LLM API key configured");
  }
}
