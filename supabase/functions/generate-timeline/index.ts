import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { createLLMClient } from "../_shared/llm-client.ts";
import { checkRateLimit, recordUsage } from "../_shared/rate-limiter.ts";
import { classifySubject } from "../_shared/classify.ts";
import type { CategoryDefinition } from "../_shared/prompts.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Parse request body
    const { subject, provider, categories, mode } = await req.json();

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing or empty 'subject' field" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1b. Classification mode — cheap, fast, no auth/rate-limit needed
    if (mode === "classify") {
      try {
        const type = await classifySubject(subject.trim());
        return new Response(JSON.stringify({ type }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (classifyErr) {
        console.error("Classification failed, falling back to topic:", classifyErr);
        return new Response(JSON.stringify({ type: "topic" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. Determine session key for rate limiting
    //    Prefer user ID from auth JWT; fall back to x-session-token header
    let sessionKey: string | null = null;

    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          sessionKey = `user:${user.id}`;
        }
      } catch {
        // Auth extraction failed — fall through to session token
      }
    }

    if (!sessionKey) {
      sessionKey = req.headers.get("x-session-token");
    }

    if (!sessionKey) {
      return new Response(
        JSON.stringify({
          error: "Authentication required. Please sign in or try again.",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Check rate limit
    const { allowed, remaining } = await checkRateLimit(sessionKey);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error:
            "You've reached the daily limit for AI timeline generation. Please try again tomorrow.",
          remaining: 0,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Create LLM client and generate timeline
    const selectedProvider =
      (provider as "openai" | "claude") ||
      (Deno.env.get("DEFAULT_LLM_PROVIDER") as "openai" | "claude") ||
      "claude";

    const client = createLLMClient(selectedProvider);

    // Pass categories if provided (Madlibs mode), otherwise fallback to legacy
    const categoryDefs: CategoryDefinition[] | undefined =
      Array.isArray(categories) && categories.length > 0
        ? categories
        : undefined;

    const result = await client.generateTimeline(
      subject.trim(),
      categoryDefs
    );

    // 5. Record usage
    await recordUsage(sessionKey);

    // 6. Return result
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(remaining - 1),
      },
    });
  } catch (err) {
    console.error("generate-timeline error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
