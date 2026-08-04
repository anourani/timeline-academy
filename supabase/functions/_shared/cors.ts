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
  return {
    "Access-Control-Allow-Origin": isAllowed(origin, origins) ? origin : origins[0],
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}
