// Sets the caller's byok_enabled flag in app_metadata (service-role only).
//
// Plan limits are derived server-side from this flag, so it must not live in
// user_metadata — that blob is writable by the client via auth.updateUser(),
// which would let any user self-upgrade their quota. app_metadata can only be
// written through the admin API, so the flag goes through this function.
// The flag is self-scoped (callers can only toggle their own) and gates
// nothing sensitive beyond quota, so no rate limiting is needed here.

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

    const { enabled } = await req.json();
    if (typeof enabled !== "boolean") {
      return json({ error: "Missing or invalid 'enabled' field." }, 400);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: { byok_enabled: enabled },
    });
    if (error) {
      console.error("set-byok-flag update failed:", error);
      return json({ error: "Failed to update plan flag." }, 500);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    console.error("set-byok-flag error:", err);
    return json({ error: "Failed to update plan flag." }, 500);
  }
});
