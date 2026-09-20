// Account storage for BYOK keys and the chosen model.
//
// Keys used to live only in the browser's localStorage, which made them a
// property of the device. Signing in on a second browser left the premium
// models locked, and the old client's reconcile — seeing no local key —
// pushed byok_enabled back to false, demoting the whole account to Free
// limits. Both problems are the same problem: the key and the account were
// not stored together.
//
// So this function owns three things:
//   1. The ciphertext in public.user_byok_keys. Service-role only; the
//      plaintext key exists here just long enough to be encrypted or handed
//      back to its owner.
//   2. The model preference in public.user_byok_settings. Opaque to us —
//      generate-timeline still never reads a model, and the Free tier stays
//      pinned server-side. This is storage, not selection.
//   3. The byok_enabled flag in app_metadata, now DERIVED from whether rows
//      exist rather than reported by the client. That is what makes the
//      demotion bug structurally impossible rather than merely fixed.
//
// set-byok-flag is deliberately left deployed: cached old bundles still call
// it, and the `get` here heals whatever they set.
//
// No rate limit. Every action is authenticated, self-scoped, and bounded —
// a user has at most two key rows and one settings row.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import {
  decryptSecret,
  encryptSecret,
  loadByokKey,
} from "../_shared/byok-crypto.ts";

type Provider = "anthropic" | "openai";

type AdminClient = ReturnType<typeof createClient>;

/** Long enough for any current provider key with room to spare; short enough
 *  that the column cannot be used as general-purpose storage. */
const MAX_KEY_LENGTH = 512;
const MAX_MODEL_LENGTH = 64;

function isProvider(value: unknown): value is Provider {
  return value === "anthropic" || value === "openai";
}

/**
 * The same loose prefix check the client runs, repeated here because the
 * client is not a trust boundary. Deliberately not a format validation: a new
 * key shape from either provider must still save without a function deploy.
 */
function keyFormatError(provider: Provider, key: string): string | null {
  if (key.length > MAX_KEY_LENGTH) return "That key is too long.";
  if (provider === "anthropic") {
    return key.startsWith("sk-ant-")
      ? null
      : "Anthropic keys start with sk-ant-.";
  }
  return key.startsWith("sk-") && !key.startsWith("sk-ant-")
    ? null
    : "OpenAI keys start with sk-.";
}

/**
 * Brings app_metadata.byok_enabled in line with whether the user has any key
 * row. Best-effort by design: the flag only gates plan limits, and failing
 * the whole request because a metadata write blipped would lose the key the
 * user just pasted. Every subsequent `get` retries it.
 */
async function syncByokFlag(
  admin: AdminClient,
  userId: string,
  currentFlag: boolean
): Promise<void> {
  try {
    const { count, error } = await admin
      .from("user_byok_keys")
      .select("provider", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) {
      console.error("byok-keys flag count failed:", error);
      return;
    }
    const shouldBeEnabled = (count ?? 0) > 0;
    if (shouldBeEnabled === currentFlag) return;

    const { error: updateError } = await admin.auth.admin.updateUserById(
      userId,
      { app_metadata: { byok_enabled: shouldBeEnabled } }
    );
    if (updateError) console.error("byok-keys flag update failed:", updateError);
  } catch (err) {
    console.error("byok-keys flag sync error:", err);
  }
}

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

    const body = await req.json().catch(() => null);
    const action = body && typeof body === "object"
      ? (body as Record<string, unknown>).action
      : null;
    // Validated strictly so an old cached bundle's `{ enabled: false }` body
    // — which is exactly the demotion this function exists to prevent — falls
    // through to a 400 and changes nothing.
    if (
      action !== "get" &&
      action !== "set" &&
      action !== "delete" &&
      action !== "set-model"
    ) {
      return json({ error: "Missing or invalid 'action' field." }, 400);
    }

    const cryptoKey = await loadByokKey();
    if (!cryptoKey) {
      // The client treats this as "stay on browser-only storage", so the site
      // keeps working until the secret is set.
      return json({ error: "Account key storage is not configured." }, 503);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const currentFlag = !!user.app_metadata?.byok_enabled;
    const fields = body as Record<string, unknown>;

    if (action === "get") {
      const [keyRows, settingsRow] = await Promise.all([
        admin
          .from("user_byok_keys")
          .select("provider, ciphertext, iv")
          .eq("user_id", user.id),
        admin
          .from("user_byok_settings")
          .select("model")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (keyRows.error) {
        console.error("byok-keys read failed:", keyRows.error);
        return json({ error: "Failed to read stored keys." }, 500);
      }

      const keys: Record<Provider, string | null> = {
        anthropic: null,
        openai: null,
      };
      for (const row of keyRows.data ?? []) {
        const provider = row.provider;
        if (!isProvider(provider)) continue;
        try {
          keys[provider] = await decryptSecret(
            cryptoKey,
            row.ciphertext,
            row.iv,
            `${user.id}:${provider}`
          );
        } catch (err) {
          // Almost always a rotated BYOK_ENCRYPTION_KEY. Report the provider
          // as key-less so the user is asked to re-add it, rather than 500ing
          // the whole sync and taking the other provider's key down with it.
          console.error(`byok-keys decrypt failed for ${provider}:`, err);
        }
      }

      await syncByokFlag(admin, user.id, currentFlag);
      return json({ keys, model: settingsRow.data?.model ?? null }, 200);
    }

    if (action === "set") {
      const provider = fields.provider;
      if (!isProvider(provider)) {
        return json({ error: "Missing or invalid 'provider' field." }, 400);
      }
      const rawKey = typeof fields.key === "string" ? fields.key.trim() : "";
      if (!rawKey) {
        return json({ error: "Missing 'key' field." }, 400);
      }
      const formatError = keyFormatError(provider, rawKey);
      if (formatError) return json({ error: formatError }, 400);

      const { ciphertext, iv } = await encryptSecret(
        cryptoKey,
        rawKey,
        `${user.id}:${provider}`
      );
      const { error } = await admin.from("user_byok_keys").upsert(
        {
          user_id: user.id,
          provider,
          ciphertext,
          iv,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      );
      if (error) {
        console.error("byok-keys write failed:", error);
        return json({ error: "Failed to save the key." }, 500);
      }

      await syncByokFlag(admin, user.id, currentFlag);
      return json({ ok: true }, 200);
    }

    if (action === "delete") {
      const provider = fields.provider;
      if (!isProvider(provider)) {
        return json({ error: "Missing or invalid 'provider' field." }, 400);
      }
      const { error } = await admin
        .from("user_byok_keys")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider);
      if (error) {
        console.error("byok-keys delete failed:", error);
        return json({ error: "Failed to remove the key." }, 500);
      }

      // The model preference is deliberately left alone: removing one of two
      // keys should not silently reset the dropdown, and the client's
      // resolver already falls back to the remaining provider's default.
      await syncByokFlag(admin, user.id, currentFlag);
      return json({ ok: true }, 200);
    }

    // set-model
    const model = fields.model;
    if (model !== null && typeof model !== "string") {
      return json({ error: "Missing or invalid 'model' field." }, 400);
    }
    if (typeof model === "string" && model.length > MAX_MODEL_LENGTH) {
      return json({ error: "That model id is too long." }, 400);
    }
    // No id validation on purpose. The registry lives in the client bundle
    // (src/constants/models.ts) and rotates on a site deploy; a server-side
    // allow-list would turn every model change into a function deploy, which
    // is exactly the coupling the Edge Functions were built to avoid.
    const { error } = await admin.from("user_byok_settings").upsert(
      {
        user_id: user.id,
        model: model ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) {
      console.error("byok-keys model write failed:", error);
      return json({ error: "Failed to save the model preference." }, 500);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    console.error("byok-keys error:", err);
    return json({ error: "Request failed." }, 500);
  }
});
