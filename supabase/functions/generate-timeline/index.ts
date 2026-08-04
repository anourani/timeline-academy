import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { createLLMClient } from "../_shared/llm-client.ts";
import { checkRateLimit, recordUsage } from "../_shared/rate-limiter.ts";
import { classifySubject } from "../_shared/classify.ts";
import type { CategoryDefinition } from "../_shared/prompts.ts";

const MAX_SUBJECT_LENGTH = 200;
// Classification is a cheap Haiku call made once before each generation, so it
// gets its own, larger budget instead of consuming the generation quota.
const CLASSIFY_RATE_LIMIT = 30;

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
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
    });

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Parse request body
    const { subject, categories, mode } = await req.json();

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return json({ error: "Missing or empty 'subject' field" }, 400);
    }
    if (subject.length > MAX_SUBJECT_LENGTH) {
      return json({ error: "Subject is too long." }, 400);
    }

    // 2. Every server-funded AI call requires a signed-in user. Anonymous
    //    visitors use their own Anthropic key browser-direct instead.
    const userId = await authenticateUser(req);
    if (!userId) {
      return json({ error: "Sign in to generate timelines." }, 401);
    }

    // 3. Classification mode — cheap, but still authenticated and metered
    //    (on its own budget so it doesn't consume the generation quota).
    if (mode === "classify") {
      const { allowed } = await checkRateLimit(
        `classify:user:${userId}`,
        CLASSIFY_RATE_LIMIT
      );
      if (!allowed) {
        return json({ type: "topic" }, 200);
      }
      try {
        const type = await classifySubject(subject.trim());
        await recordUsage(`classify:user:${userId}`);
        return json({ type }, 200);
      } catch (classifyErr) {
        console.error("Classification failed, falling back to topic:", classifyErr);
        return json({ type: "topic" }, 200);
      }
    }

    // 4. Check the generation rate limit
    const sessionKey = `user:${userId}`;
    const { allowed, remaining } = await checkRateLimit(sessionKey);
    if (!allowed) {
      return json(
        {
          error:
            "You've reached the daily limit for AI timeline generation. Please try again tomorrow.",
          remaining: 0,
        },
        429
      );
    }

    // 5. Create LLM client and generate timeline. The provider is a server
    //    decision — never taken from the request body.
    const selectedProvider =
      (Deno.env.get("DEFAULT_LLM_PROVIDER") as "openai" | "claude") || "claude";

    const client = createLLMClient(selectedProvider);

    // Pass categories if provided (Madlibs mode), otherwise fallback to legacy
    const categoryDefs: CategoryDefinition[] | undefined =
      Array.isArray(categories) && categories.length > 0
        ? categories
        : undefined;

    const result = await client.generateTimeline(subject.trim(), categoryDefs);

    // 6. Record usage
    await recordUsage(sessionKey);

    // 7. Return result
    return json(result, 200, { "X-RateLimit-Remaining": String(remaining - 1) });
  } catch (err) {
    // Upstream provider errors can carry account details in their bodies —
    // log the specifics server-side, return only a generic message.
    console.error("generate-timeline error:", err);
    return json({ error: "Timeline generation failed. Please try again." }, 500);
  }
});
