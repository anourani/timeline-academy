// AI-powered event enrichment with web search grounding.
//
// Streams a 1-2 paragraph encyclopedic description of a historical event over
// SSE, then emits a `sources` event with the URLs Claude actually visited via
// the web_search tool. URLs are extracted from web_search_tool_result blocks
// only — never from inline citations the model invents.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, recordUsage } from "../_shared/rate-limiter.ts";

interface EnrichRequest {
  eventTitle?: string;
  startDate?: string;
  endDate?: string;
  timelineTitle?: string;
}

interface SourceItem {
  title: string;
  url: string;
}

const SYSTEM_PROMPT = `You are writing a 1-2 paragraph description of a historical event for an educational timeline. Use the web_search tool to find authoritative sources before writing. Keep the description concise (max ~150 words for simple events, two short paragraphs for complex ones). Use a neutral encyclopedic tone. Do not include inline citations or footnotes — sources are listed separately. Do not invent facts that aren't in the search results.`;

function buildUserPrompt(req: EnrichRequest): string {
  const lines: string[] = [];
  lines.push(`Write a description for this event: "${req.eventTitle ?? ""}"`);
  if (req.startDate || req.endDate) {
    if (req.startDate && req.endDate && req.startDate !== req.endDate) {
      lines.push(`Date range: ${req.startDate} to ${req.endDate}`);
    } else if (req.startDate) {
      lines.push(`Date: ${req.startDate}`);
    }
  }
  if (req.timelineTitle) {
    lines.push(`Timeline context: ${req.timelineTitle}`);
  }
  lines.push(
    `Use the web_search tool to find sources, then write the description. Output only the description text — no headings, no source lists.`
  );
  return lines.join("\n");
}

function sseEncode(event: string, data: unknown): Uint8Array {
  const payload = JSON.stringify(data);
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth — no anonymous enrichment.
  const userId = await authenticateUser(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Authentication required." }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Rate limit (5 enrichments per user per 24h).
  const sessionKey = `enrich:${userId}`;
  const { allowed } = await checkRateLimit(sessionKey);
  if (!allowed) {
    return new Response(
      JSON.stringify({
        error:
          "You've reached the daily limit for AI event enrichment. Please try again tomorrow.",
      }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  let body: EnrichRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.eventTitle || !body.eventTitle.trim()) {
    return new Response(
      JSON.stringify({ error: "Missing eventTitle." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(sseEncode(event, data));
      };

      try {
        const anthropicRes = await fetch(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              system: SYSTEM_PROMPT,
              tools: [
                {
                  type: "web_search_20250305",
                  name: "web_search",
                  max_uses: 3,
                },
              ],
              messages: [
                { role: "user", content: buildUserPrompt(body) },
              ],
              stream: true,
            }),
          }
        );

        if (!anthropicRes.ok || !anthropicRes.body) {
          const errText = await anthropicRes.text().catch(() => "");
          send("error", {
            message: `Anthropic API error (${anthropicRes.status}): ${errText.slice(0, 200)}`,
          });
          controller.close();
          return;
        }

        // Track sources discovered via web_search tool results.
        const sources: SourceItem[] = [];
        const seenUrls = new Set<string>();

        // Track current content block index → block type (so deltas can be
        // routed correctly). Anthropic's stream emits content_block_start
        // events with type info, then content_block_delta events.
        const blockTypes = new Map<number, string>();

        const reader = anthropicRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Anthropic SSE: events delimited by \n\n.
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const lines = rawEvent.split("\n");
            let eventName = "";
            let dataStr = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventName = line.slice(7).trim();
              else if (line.startsWith("data: ")) dataStr += line.slice(6);
            }
            if (!dataStr) continue;
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(dataStr);
            } catch {
              continue;
            }

            if (eventName === "content_block_start") {
              const index = data.index as number;
              const block = data.content_block as Record<string, unknown>;
              if (block && typeof block.type === "string") {
                blockTypes.set(index, block.type);
              }
              // web_search_tool_result blocks come fully-formed in
              // content_block_start (or sometimes via deltas) — extract URLs
              // immediately if present.
              if (block?.type === "web_search_tool_result") {
                const content = block.content as Array<Record<string, unknown>> | undefined;
                if (Array.isArray(content)) {
                  for (const item of content) {
                    if (item.type === "web_search_result") {
                      const url = item.url as string | undefined;
                      const title = (item.title as string | undefined) ?? "";
                      if (url && !seenUrls.has(url)) {
                        seenUrls.add(url);
                        sources.push({ title: title || url, url });
                      }
                    }
                  }
                }
              }
            } else if (eventName === "content_block_delta") {
              const index = data.index as number;
              const delta = data.delta as Record<string, unknown>;
              const blockType = blockTypes.get(index);
              // Only emit description text from text blocks (not tool input).
              if (blockType === "text" && delta?.type === "text_delta") {
                const text = delta.text as string;
                if (text) send("delta", { text });
              }
            } else if (eventName === "message_stop") {
              // End of stream; loop will exit when reader is done.
            }
          }
        }

        send("sources", { sources });
        send("done", {});
        controller.close();

        // Record usage after a successful run (not blocking the response).
        recordUsage(sessionKey).catch(() => {});
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        try {
          send("error", { message });
        } catch {
          // controller may already be closed
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
