# CLAUDE.md

## Project Overview

Timeline Academy — an interactive timeline builder that lets users search for a person or era and get a full, detailed timeline they can scroll through and interact with. The product is informational and educational in intent; keep that spirit in feature work. Built with React, TypeScript, Vite, and Supabase.

## Commands

```bash
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # Production build (output: dist/)
npm run lint      # ESLint on .ts/.tsx files
npm run preview   # Preview production build locally
```

No test framework is configured — every check is manual. This is the direct reason a five-month drift between this repo and the live project went unnoticed, along with three features that were silently broken in production for months (see `docs/2026-08-05-security-review-handoff.md`).

## Architecture

```
src/
├── components/       # Feature-folder organized React components
│   ├── Legal/        # /privacy and /terms pages
│   └── ui/           # shadcn/ui primitives
├── hooks/            # Custom React hooks (useTimeline, useEvents, useAutosave, useAIMode, etc.)
├── contexts/         # React Context providers (AuthContext, SidePanelContext)
├── services/         # AI generation + external APIs:
│                     #   aiTimeline, anthropicDirect (BYOK), eventEnrichment,
│                     #   llmPrompts, userApiKey, viewerEventCache,
│                     #   wikipediaSearch, wikipediaImage
├── utils/            # Helpers (csvParser, excelSheet/excelExport, dateUtils,
│                     #   eventStacking, draftStorage, saveEvents, etc.)
├── types/            # TypeScript type definitions (event.ts, timeline.ts)
├── constants/        # App constants (categories, defaults, scales, plans)
├── lib/              # Supabase client setup, plan limits
├── App.tsx           # Timeline editor page (/editor)
├── Router.tsx        # Routes: / → AIModePage, /editor → App,
│                     #   /view/:id → TimelineViewer, /privacy, /terms
└── main.tsx          # Entry point
supabase/
├── config.toml       # Per-function settings (verify_jwt) + project_id
├── functions/        # Edge Functions: generate-timeline, enrich-event,
│                     #   set-byok-flag, delete-account, and _shared/
└── migrations/       # Database migrations (applied BY HAND — see below)
.github/workflows/
└── deploy-functions.yml   # Deploys all edge functions on merge to main
```

## Code Style & Conventions

- **TypeScript** strict mode enabled. No unused locals or parameters. Target ES2020.
- **Path alias**: `@/` maps to `src/` — use for all imports.
- **Tailwind CSS** for styling. Dark mode via `class` strategy.
- **Fonts**: Aleo, IBM Plex Mono and JetBrains Mono load from Google Fonts (`src/index.css:1`). `Avenir` is declared and referenced throughout, but **has never actually loaded** — `index.css:81` points a `@font-face src` at a stylesheet URL rather than a font file, so everything specifying Avenir falls back to a system sans-serif. Known and deliberately deferred; fixing it changes the look of the whole interface.
- **shadcn/ui** — Custom preset, Base UI library, Vega style, Neutral base/theme color, Lucide icons, Inter font, Medium radius, Default menu color, Subtle menu accent.
- **Component organization**: Feature folders under `src/components/` (e.g., `Auth/`, `Timeline/`, `Navigation/`, `AIMode/`).
- **State management**: Custom hooks for feature logic; React Context for global state (auth, side panel).
- **ESLint** flat config with TypeScript ESLint and React Hooks plugins. No Prettier.
- **No semicolons or formatting tool** — follow existing code style in each file.
- **Spreadsheets** use `exceljs` via the shared helper in `src/utils/excelSheet.ts`, lazy-loaded into its own chunk. The `xlsx` package was removed (frozen on npm at 0.18.5 with prototype-pollution and ReDoS advisories, while parsing untrusted uploads). Don't reintroduce it.

## Environment

**Client** — copy `.env.example` to `.env`:

```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

All client-exposed env vars use the `VITE_` prefix. In production these live in Netlify's environment variables.

**Server (edge functions)** — set in Supabase → Edge Functions → Secrets, not in any file. They survive deploys:

- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — LLM providers
- `DEFAULT_LLM_PROVIDER` — `claude` (default) or `openai`
- `ALLOWED_ORIGINS` — optional comma-separated override of the CORS allow-list
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — injected automatically

**CI** — GitHub repository secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`.

## Deployment

Three independent paths. Understanding that they are separate — and finish at different moments — matters more than any other operational detail here.

1. **Site → Netlify**, automatically on merge to `main`. `netlify.toml` also serves the CSP and security headers.
2. **Edge functions → GitHub Actions** (`.github/workflows/deploy-functions.yml`), which runs `supabase functions deploy` on pushes to `main` touching `supabase/functions/**` or `supabase/config.toml`. Also triggerable manually from the Actions tab. Production project ref: `ltudgurcouffxyuxvpmw`.
3. **Migrations → by hand**, pasted into the Supabase SQL editor. Nothing enforces or verifies this.

## Critical operational rules

Each of these was learned the expensive way. See `docs/2026-08-05-security-review-handoff.md` for the incidents behind them.

- **Never paste function code into the Supabase dashboard.** A function's `index.ts` and its `_shared/` imports must ship together; hand-copying them separately leaves the function broken. Let CI deploy.
- **Never assume a migration in `supabase/migrations/` has been applied.** Verify against `information_schema.columns` first. An unapplied April–May 2026 batch silently broke autosave, event descriptions and sharing for three months while the code that depended on it shipped normally.
- **`verify_jwt` must stay `false`** in `supabase/config.toml`. With it `true`, Supabase's gateway rejects the CORS preflight — which by specification carries no `Authorization` header — and answers with headers omitting `content-type`, so browsers can never POST JSON. Every function authenticates its own caller with `supabase.auth.getUser()`, so the gateway check adds nothing.
- **Do not "tighten" `_shared/cors.ts`.** It deliberately reflects `Access-Control-Request-Headers` back. A hand-written allow-list turns the client library's exact header set into a deploy-time dependency, and the failure is invisible to `curl` — because `curl` only asks permission for headers you already thought of.
- **A function must accept both the current site and the previous one.** The two pipelines finish at different times and cached bundles persist for longer still. Keep old headers permitted and old request shapes tolerated.
- **Debug with `curl` before the browser.** CORS is a browser-only mechanism, so `curl` separates "the server is broken" from "the browser refused to send" — a distinction that once cost hours.

## Access & data model

- **Server-funded AI requires sign-in.** Anonymous visitors hitting Generate get a gate offering email sign-in or their own Anthropic key. BYOK runs browser-direct (`services/anthropicDirect.ts`) and never touches our servers.
- **Identity is email-only** — passwordless OTP, 6-digit codes, custom SMTP via Resend from `timeline.academy`. Supabase's Email OTP Length setting must stay at 6 to match the UI.
- **Timelines are private by default.** Sharing sets `timelines.is_public`; public reads go through the `get_public_timeline` RPC, which requires the timeline's UUID and never returns `user_id`. Table policies remain owner-only.
- **Plan limits** live in `src/constants/plans.ts` and must stay in sync with `get_plan_limits` in SQL. The `byok_enabled` flag lives in `app_metadata` (service-role writable only) — never move it back to `user_metadata`, which users can edit themselves.
- **Rate limits**: 5 generations/day, 30 event enrichments/day, 30 classifications/day, per signed-in user. Enrichment is higher because descriptions auto-generate when an event is opened.
- **No analytics, tracking, or third-party scripts.** This is deliberate and is the product's strongest privacy property. Keep it that way.

## Known issues

- `Avenir` never loads (see Code Style above).
- Migrations are not automated — the other half of the drift problem.
- `/privacy` and `/terms` are engineering drafts describing the real data flows accurately, but they have not had a legal review.
- Several paths shipped in August 2026 are deployed but never exercised, including **account deletion, which is destructive**. See the handoff doc's verified/unverified section before trusting them.
