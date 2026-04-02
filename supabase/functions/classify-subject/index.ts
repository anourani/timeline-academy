import { corsHeaders } from "../_shared/cors.ts";

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
      model: "claude-haiku-4-5-20251001",
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
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: CLASSIFICATION_PROMPT.replace("{subject}", subject),
        },
      ],
      temperature: 0,
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { subject } = await req.json();

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing or empty 'subject' field" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use the cheapest/fastest model available
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    let type: string;
    if (anthropicKey) {
      type = await classifyWithClaude(anthropicKey, subject.trim());
    } else if (openaiKey) {
      type = await classifyWithOpenAI(openaiKey, subject.trim());
    } else {
      throw new Error("No LLM API key configured");
    }

    return new Response(JSON.stringify({ type }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("classify-subject error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
