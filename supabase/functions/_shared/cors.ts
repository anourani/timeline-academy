// CORS is pinned to the app's own origins instead of "*" so third-party sites
// can't drive these functions from their visitors' browsers. Override the exact
// list with a comma-separated ALLOWED_ORIGINS env var.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.timeline.academy", // production app
  "https://timeline.academy",
  "https://www.timeline.academy",
  "https://timelineacademy.netlify.app", // netlify default domain
  "http://localhost:5173", // vite dev server
];

// Netlify deploy previews get a generated hostname per PR/branch, e.g.
// https://deploy-preview-84--timelineacademy.netlify.app. They're our own
// builds of this site, so match them by suffix rather than pinning each one.
const ALLOWED_ORIGIN_SUFFIX = "--timelineacademy.netlify.app";

function allowedOrigins(): string[] {
  const fromEnv = Deno.env.get("ALLOWED_ORIGINS");
  if (!fromEnv) return DEFAULT_ALLOWED_ORIGINS;
  const parsed = fromEnv.split(",").map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

function isAllowed(origin: string, origins: string[]): boolean {
  if (origins.includes(origin)) return true;
  return origin.startsWith("https://") && origin.endsWith(ALLOWED_ORIGIN_SUFFIX);
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origins = allowedOrigins();
  const origin = req.headers.get("origin") ?? "";

  // Echo back whatever headers the browser asked permission for, rather than
  // maintaining a hand-written list. A list has to predict every header the
  // client library sends; miss one and the preflight is refused, so the real
  // request never leaves the browser — and no curl reproduces it, because a
  // curl only asks for headers you already thought of. The pre-review version
  // of this file allowed "*" for the same reason.
  //
  // This is not a weakening: Access-Control-Allow-Origin above decides *who*
  // may call these functions, and each function authenticates the caller with
  // supabase.auth.getUser(). Which header names a permitted origin may send
  // was never a security control.
  const requestedHeaders = req.headers.get("access-control-request-headers");

  return {
    "Access-Control-Allow-Origin": isAllowed(origin, origins) ? origin : origins[0],
    Vary: "Origin, Access-Control-Request-Headers",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      requestedHeaders ?? "authorization, x-client-info, apikey, content-type",
  };
}
