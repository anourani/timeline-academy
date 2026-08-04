// CORS is pinned to the production app origin(s) instead of "*" so third-party
// sites can't drive these functions from their visitors' browsers. Override
// with a comma-separated ALLOWED_ORIGINS env var (e.g. to add a preview URL).
const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.timeline.academy", // production app
  "https://timeline.academy",
  "https://www.timeline.academy",
  "https://timelineacademy.netlify.app", // netlify default domain
  "http://localhost:5173", // vite dev server
];

function allowedOrigins(): string[] {
  const fromEnv = Deno.env.get("ALLOWED_ORIGINS");
  if (!fromEnv) return DEFAULT_ALLOWED_ORIGINS;
  const parsed = fromEnv.split(",").map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origins = allowedOrigins();
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : origins[0],
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}
