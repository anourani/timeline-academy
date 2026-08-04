// Deletes the calling user's account and all their data.
//
// Order matters: timelines must go first (events and timeline_categories
// cascade off them, and timelines.user_id has no ON DELETE CASCADE back to
// auth.users, so deleting the auth user first would fail the FK). Rate-limit
// rows are keyed by user id patterns rather than a FK, so they are purged
// explicitly. Finally the auth record itself is removed via the admin API.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return json({ error: "Authentication required." }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return json({ error: "Authentication required." }, 401);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: timelinesError } = await adminClient
      .from("timelines")
      .delete()
      .eq("user_id", user.id);
    if (timelinesError) {
      console.error("delete-account: timelines purge failed:", timelinesError);
      return json({ error: "Account deletion failed. Please try again." }, 500);
    }

    const { error: rateLimitError } = await adminClient
      .from("ai_rate_limits")
      .delete()
      .in("session_key", [
        `user:${user.id}`,
        `enrich:user:${user.id}`,
        `classify:user:${user.id}`,
      ]);
    if (rateLimitError) {
      // Non-fatal: these rows also age out via the 24h retention cleanup.
      console.error("delete-account: rate-limit purge failed:", rateLimitError);
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(
      user.id
    );
    if (deleteUserError) {
      console.error("delete-account: auth delete failed:", deleteUserError);
      return json({ error: "Account deletion failed. Please try again." }, 500);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    console.error("delete-account error:", err);
    return json({ error: "Account deletion failed. Please try again." }, 500);
  }
});
