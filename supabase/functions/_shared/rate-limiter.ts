import { createClient } from "jsr:@supabase/supabase-js@2";

export const RATE_LIMIT = 5; // max generations per user per window
const WINDOW_HOURS = 24;

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function windowStart(): string {
  return new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
}

export async function checkRateLimit(
  sessionKey: string,
  limit: number = RATE_LIMIT
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = getAdminClient();

  const { count, error } = await supabase
    .from("ai_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("session_key", sessionKey)
    .gte("created_at", windowStart());

  if (error) {
    console.error("Rate limit check failed:", error);
    // Fail closed — an attacker who can break the counting query must not get
    // unmetered access to the LLM budget.
    return { allowed: false, remaining: 0 };
  }

  const used = count ?? 0;
  return {
    allowed: used < limit,
    remaining: Math.max(0, limit - used),
  };
}

export async function recordUsage(sessionKey: string): Promise<void> {
  const supabase = getAdminClient();

  const { error } = await supabase
    .from("ai_rate_limits")
    .insert({ session_key: sessionKey });

  if (error) {
    console.error("Failed to record rate limit usage:", error);
    // Non-fatal — don't block the response if recording fails
  }

  // Opportunistic retention: rows older than the rate-limit window carry no
  // purpose and would otherwise accumulate into a permanent per-user usage
  // log. Awaited (the isolate may not run detached promises to completion);
  // failures only delay cleanup until the next call.
  const { error: cleanupError } = await supabase
    .from("ai_rate_limits")
    .delete()
    .lt("created_at", windowStart());
  if (cleanupError) {
    console.error("Rate limit cleanup failed:", cleanupError);
  }
}
