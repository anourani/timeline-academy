# CLAUDE.md

## Project Overview

Timeline Academy — an interactive timeline builder that lets users create, edit, and visualize timelines of people's lives or events. Built with React, TypeScript, Vite, and Supabase.

## Commands

```bash
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # Production build (output: dist/)
npm run lint      # ESLint on .ts/.tsx files
npm run preview   # Preview production build locally
```

No test framework is configured.

## Architecture

```
src/
├── components/       # Feature-folder organized React components
│   └── ui/           # shadcn/ui primitives
├── hooks/            # Custom React hooks (useTimeline, useEvents, useAutosave, etc.)
├── contexts/         # React Context providers (AuthContext)
├── services/         # Business logic (AI timeline generation, session tokens)
├── utils/            # Helpers (CSV/Excel parsing, date utils, event stacking, etc.)
├── types/            # TypeScript type definitions (event.ts, timeline.ts)
├── constants/        # App constants (categories, defaults, scales)
├── lib/              # Supabase client setup and shared utilities
├── App.tsx           # Root component
├── Router.tsx        # Client-side routing (React Router DOM)
└── main.tsx          # Entry point
supabase/
├── functions/        # Edge Functions
└── migrations/       # Database migrations
```

## Code Style & Conventions

- **TypeScript** strict mode enabled. No unused locals or parameters. Target ES2020.
- **Path alias**: `@/` maps to `src/` — use for all imports.
- **Tailwind CSS** for styling. Dark mode via `class` strategy. Custom fonts: Avenir, IBM Plex Mono.
- **shadcn/ui** — Custom preset, Base UI library, Vega style, Neutral base/theme color, Lucide icons, Inter font, Medium radius, Default menu color, Subtle menu accent.
- **Component organization**: Feature folders under `src/components/` (e.g., `Auth/`, `Timeline/`, `Header/`).
- **State management**: Custom hooks for feature logic; React Context for global state (auth).
- **ESLint** flat config with TypeScript ESLint and React Hooks plugins. No Prettier.
- **No semicolons or formatting tool** — follow existing code style in each file.

## Environment

Copy `.env.example` to `.env` and set:

```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

All client-exposed env vars use the `VITE_` prefix.

## Deployment

Deployed via **Netlify**. SPA redirect configured in `netlify.toml` (all routes → `/index.html`).
