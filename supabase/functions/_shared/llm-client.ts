import { getSystemPrompt, getUserPrompt } from "./prompts.ts";

export interface GeneratedTimeline {
  timelineTitle: string;
  timelineDescription: string;
  events: Array<{
    title: string;
    startDate: string;
    endDate: string;
    category: string;
  }>;
}

export interface LLMClient {
  generateTimeline(subject: string): Promise<GeneratedTimeline>;
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

class OpenAIClient implements LLMClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateTimeline(subject: string): Promise<GeneratedTimeline> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: getSystemPrompt() },
          { role: "user", content: getUserPrompt(subject) },
        ],
        temperature: 0.4,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${body}`);
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from OpenAI");

    return parseAndValidate(text);
  }
}

// ---------------------------------------------------------------------------
// Anthropic / Claude
// ---------------------------------------------------------------------------

class ClaudeClient implements LLMClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateTimeline(subject: string): Promise<GeneratedTimeline> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6-20250514",
        max_tokens: 4096,
        system: getSystemPrompt(),
        messages: [
          { role: "user", content: getUserPrompt(subject) },
          { role: "assistant", content: "{" },
        ],
        temperature: 0.4,
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

    // We prefilled with "{" so the response continues from there
    const text = "{" + block.text;
    return parseAndValidate(text);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function parseAndValidate(text: string): GeneratedTimeline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("LLM returned invalid JSON");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.timelineTitle !== "string" || !obj.timelineTitle) {
    throw new Error("Missing or invalid timelineTitle in LLM response");
  }
  if (typeof obj.timelineDescription !== "string") {
    throw new Error("Missing timelineDescription in LLM response");
  }
  if (!Array.isArray(obj.events) || obj.events.length === 0) {
    throw new Error("Missing or empty events array in LLM response");
  }

  const validCategories = new Set([
    "category_1",
    "category_2",
    "category_3",
    "category_4",
  ]);

  const events = (obj.events as Record<string, unknown>[]).map(
    (e, i: number) => {
      if (typeof e.title !== "string" || !e.title) {
        throw new Error(`Event ${i}: missing title`);
      }
      if (typeof e.startDate !== "string" || !e.startDate) {
        throw new Error(`Event ${i}: missing startDate`);
      }
      if (typeof e.endDate !== "string" || !e.endDate) {
        throw new Error(`Event ${i}: missing endDate`);
      }

      const category =
        typeof e.category === "string" && validCategories.has(e.category)
          ? e.category
          : "category_4"; // Default to "Other" if category is invalid

      return {
        title: (e.title as string).slice(0, 55),
        startDate: e.startDate as string,
        endDate: e.endDate as string,
        category,
      };
    }
  );

  return {
    timelineTitle: obj.timelineTitle as string,
    timelineDescription: obj.timelineDescription as string,
    events,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLLMClient(provider: "openai" | "claude"): LLMClient {
  if (provider === "claude") {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
    return new ClaudeClient(key);
  }

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAIClient(key);
}
