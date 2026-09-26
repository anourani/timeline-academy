import {
  getStreamSystemPrompt,
  getSystemPrompt,
  getUserPrompt,
} from "./prompts.ts";
import type { CategoryDefinition } from "./prompts.ts";

export interface GeneratedTimeline {
  timelineTitle: string;
  timelineDescription: string;
  categoryMapping?: Record<string, string>;
  chapters?: Array<{
    label: string;
    startDate: string;
    endDate: string;
  }>;
  events: Array<{
    title: string;
    startDate: string;
    endDate: string;
    category: string;
  }>;
}

export interface LLMClient {
  generateTimeline(
    subject: string,
    categories?: CategoryDefinition[]
  ): Promise<GeneratedTimeline>;

  /**
   * The same generation as NDJSON, streamed.
   *
   * Returns plain `application/x-ndjson` bytes rather than SSE: the provider's
   * own SSE framing is unwrapped here so the browser reads whole lines and
   * never learns which provider produced them. That keeps this hop a pass-
   * through — validation stays client-side, one implementation for all three
   * routes, rather than a second copy of the rules that can drift from
   * llmShared.ts the way parseAndValidate already does.
   */
  streamTimeline(
    subject: string,
    categories?: CategoryDefinition[]
  ): Promise<ReadableStream<Uint8Array>>;
}

// ---------------------------------------------------------------------------
// Provider SSE → NDJSON text
// ---------------------------------------------------------------------------

/**
 * Pump a provider's SSE body into a plain-text stream, one `onFrame` call per
 * frame payload.
 *
 * Deliberately tiny and local. enrich-event/index.ts has the same loop inline
 * for its own frames; sharing one reader across two functions with different
 * frame vocabularies would need a config object longer than either copy.
 */
function pumpProviderSse(
  body: ReadableStream<Uint8Array>,
  extractText: (frame: Record<string, unknown>) => string | null,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            let dataStr = "";
            for (const line of raw.split("\n")) {
              if (line.startsWith("data: ")) dataStr += line.slice(6);
            }
            if (!dataStr || dataStr === "[DONE]") continue;

            let frame: Record<string, unknown>;
            try {
              frame = JSON.parse(dataStr);
            } catch {
              continue;
            }

            const text = extractText(frame);
            if (text) controller.enqueue(encoder.encode(text));
          }
        }
      } catch (err) {
        // The browser sees a truncated NDJSON body: every whole line it
        // already read stands, and the severed last one is dropped by the
        // line reader. Logged here because nothing downstream can see why.
        console.error("generate-timeline stream error:", err);
      } finally {
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

class OpenAIClient implements LLMClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateTimeline(
    subject: string,
    categories?: CategoryDefinition[]
  ): Promise<GeneratedTimeline> {
    const userPrompt = categories
      ? getUserPrompt(subject, categories)
      : `Generate a biographical timeline for: ${subject}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        // Mid-tier of the current family — deliberately not the frontier
        // model, which costs several times as much for bounded JSON output.
        // NOTE: this path only runs when DEFAULT_LLM_PROVIDER is "openai", so
        // it is rarely exercised; confirm the parameter contract against live
        // OpenAI docs before relying on it.
        model: "gpt-5.6-terra",
        // `response_format: json_object` requires the literal word "JSON" to
        // appear somewhere in the messages. getSystemPrompt() satisfies that
        // incidentally ("JSON ONLY", "RESPONSE SCHEMA") — an edit to the
        // prompt that drops the word would 400 every OpenAI generation while
        // the Claude path kept working.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: getSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
        // No `temperature`: newer reasoning-capable models reject non-default
        // sampling parameters.
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

  async streamTimeline(
    subject: string,
    categories?: CategoryDefinition[]
  ): Promise<ReadableStream<Uint8Array>> {
    const userPrompt = categories
      ? getUserPrompt(subject, categories)
      : `Generate a biographical timeline for: ${subject}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.6-terra",
        // No `response_format: json_object` here, unlike generateTimeline
        // above: that mode returns exactly ONE JSON object, and NDJSON is
        // many. Sending it would yield a single object where the client's
        // line reader expects one per line — a failure that reads like a bad
        // model rather than a bad body.
        stream: true,
        messages: [
          { role: "system", content: getStreamSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${body}`);
    }

    return pumpProviderSse(res.body, (frame) => {
      const choices = frame.choices as Array<Record<string, unknown>> | undefined;
      const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
      return (delta?.content as string | undefined) ?? null;
    });
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

  async generateTimeline(
    subject: string,
    categories?: CategoryDefinition[]
  ): Promise<GeneratedTimeline> {
    const userPrompt = categories
      ? getUserPrompt(subject, categories)
      : `Generate a biographical timeline for: ${subject}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // The server-funded pin. This is the model the client registry marks
        // `serverFunded: true` (src/constants/models.ts), which is what makes
        // the dropdown show "Claude Sonnet" selected for a keyless visitor.
        // The two must agree: if DEFAULT_LLM_PROVIDER is ever flipped to
        // "openai", the Free tier's dropdown label becomes a lie and nothing
        // in the code will notice.
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: getSystemPrompt(),
        messages: [
          { role: "user", content: userPrompt },
        ],
        // No `temperature`: Sonnet 5 rejects a non-default value with a 400.
        // This is the default server-funded path, so leaving the old 0.4 in
        // place would have broken generation for every free-tier user.
        //
        // Thinking off: this call emits a fixed JSON schema with no tools, and
        // Sonnet 5 otherwise spends part of the same max_tokens budget on
        // reasoning the JSON does not need.
        thinking: { type: "disabled" },
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

    // Strip markdown code fences if the model wraps the JSON
    let text = block.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    return parseAndValidate(text);
  }

  async streamTimeline(
    subject: string,
    categories?: CategoryDefinition[]
  ): Promise<ReadableStream<Uint8Array>> {
    const userPrompt = categories
      ? getUserPrompt(subject, categories)
      : `Generate a biographical timeline for: ${subject}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Same server-funded pin as generateTimeline above — see the note
        // there about this agreeing with the client registry.
        model: "claude-sonnet-5",
        max_tokens: 4096,
        stream: true,
        system: getStreamSystemPrompt(),
        messages: [
          { role: "user", content: userPrompt },
        ],
        // Thinking off, as above. It also happens to be what makes the
        // streaming path worth having here: with reasoning disabled the
        // first text arrives immediately, so the client's `meta` line — and
        // with it the timeline axis — lands in the opening frames.
        thinking: { type: "disabled" },
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${body}`);
    }

    // Routed by content-block type rather than taking every delta: thinking
    // is disabled on this pin so there should be no reasoning blocks, but
    // reading `delta.text` blindly would quietly ship them into the line
    // buffer the day that pin changes.
    const blockTypes = new Map<number, string>();

    return pumpProviderSse(res.body, (frame) => {
      const type = frame.type as string | undefined;

      if (type === "content_block_start") {
        const block = frame.content_block as Record<string, unknown> | undefined;
        if (block && typeof block.type === "string") {
          blockTypes.set(frame.index as number, block.type);
        }
        return null;
      }

      if (type === "content_block_delta") {
        const delta = frame.delta as Record<string, unknown> | undefined;
        if (
          blockTypes.get(frame.index as number) === "text" &&
          delta?.type === "text_delta"
        ) {
          return (delta.text as string | undefined) ?? null;
        }
      }

      return null;
    });
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

  const events = (obj.events as Record<string, unknown>[])
    .filter((e) => {
      // Filter out events with categories outside the provided set
      return (
        typeof e.category === "string" && validCategories.has(e.category)
      );
    })
    .map((e, i: number) => {
      if (typeof e.title !== "string" || !e.title) {
        throw new Error(`Event ${i}: missing title`);
      }
      if (typeof e.startDate !== "string" || !e.startDate) {
        throw new Error(`Event ${i}: missing startDate`);
      }
      if (typeof e.endDate !== "string" || !e.endDate) {
        throw new Error(`Event ${i}: missing endDate`);
      }

      return {
        title: (e.title as string).slice(0, 55),
        startDate: e.startDate as string,
        endDate: e.endDate as string,
        category: e.category as string,
      };
    });

  if (events.length === 0) {
    throw new Error("No valid events in LLM response");
  }

  // Extract categoryMapping if present
  let categoryMapping: Record<string, string> | undefined;
  if (
    obj.categoryMapping &&
    typeof obj.categoryMapping === "object" &&
    !Array.isArray(obj.categoryMapping)
  ) {
    categoryMapping = obj.categoryMapping as Record<string, string>;
  }

  return {
    timelineTitle: obj.timelineTitle as string,
    timelineDescription: obj.timelineDescription as string,
    categoryMapping,
    chapters: parseChapters(obj.chapters),
    events,
  };
}

/**
 * Chapters are optional and never fatal.
 *
 * The site and these functions deploy on separate pipelines, so an old browser
 * bundle routinely reads a new function's response and vice versa. A response
 * without usable chapters just yields undefined — a client that doesn't know
 * the field ignores it, and one that does renders no strip.
 */
function parseChapters(
  raw: unknown
): Array<{ label: string; startDate: string; endDate: string }> | undefined {
  if (!Array.isArray(raw)) return undefined;

  const chapters = (raw as Record<string, unknown>[])
    .filter(
      (c) =>
        typeof c.label === "string" &&
        c.label.length > 0 &&
        typeof c.startDate === "string" &&
        c.startDate.length > 0 &&
        typeof c.endDate === "string" &&
        c.endDate.length > 0
    )
    .map((c) => ({
      label: (c.label as string).slice(0, 30),
      startDate: c.startDate as string,
      endDate: c.endDate as string,
    }));

  return chapters.length > 0 ? chapters : undefined;
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
