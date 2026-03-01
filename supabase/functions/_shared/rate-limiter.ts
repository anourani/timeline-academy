import { createClient } from "jsr:@supabase/supabase-js@2";

const RATE_LIMIT = 5; // max generations per session per window
const WINDOW_HOURS = 24;

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export async function checkRateLimit(
  sessionKey: string
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = getAdminClient();
  const windowStart = new Date(
    Date.now() - WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { count, error } = await supabase
    .from("ai_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("session_key", sessionKey)
    .gte("created_at", windowStart);

  if (error) {
    console.error("Rate limit check failed:", error);
    // Fail open — allow the request if the rate limit check itself fails
    return { allowed: true, remaining: RATE_LIMIT };
  }

  const used = count ?? 0;
  return {
    allowed: used < RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - used),
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
}
