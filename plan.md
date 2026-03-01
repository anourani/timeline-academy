# Plan: AI Mode — "Enter a name. we build the timeline."

## Context

The most intimidating part of building a timeline is starting from scratch. AI mode eliminates this blank-canvas friction by letting users type a person's name and receive a pre-populated timeline. This is **not a toggle** — it's a one-time creation step. Once the timeline exists (via AI or manual), the user is permanently in the standard edit experience.

**Trigger points:**
- **Logged-in users**: Shown when they click "Create New Timeline" (from Homepage or SidePanel)
- **Logged-out users**: Shown on first visit when no localStorage draft exists

**Two paths from the creation screen:**
1. Enter a name → LLM generates timeline → user lands in edit mode with populated events
2. Click "Create my own timeline" → existing empty timeline flow (as it works today)

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM provider | **Both OpenAI + Claude** | Abstraction layer supporting either provider |
| Backend for LLM calls | **Supabase Edge Functions** | Already in the Supabase ecosystem, no new infra |
| Category handling | **Decide later** | Start with existing 4 default categories in Phase 1 |
| Auth requirement | **Available to all users** | Logged-out users get localStorage draft; logged-in users save to Supabase |
| Event count | **Dynamic (LLM decides)** | LLM determines appropriate count based on person's significance |
| Rate limiting | **Session-based token** | Anonymous sessions tracked via token in localStorage |
| Subject scope | **People first, extensible** | Architect for eventual non-person topics (events, movements, etc.) |

---

## Phase 1: New Timeline Creation Screen (Frontend Only) — DONE

Build the UI component and wire it into the existing creation flow. No LLM integration yet — the AI submit will be wired up in Phase 2.

### 1.1 New Component: `NewTimelineScreen`

**File: `src/components/NewTimeline/NewTimelineScreen.tsx`**

Full-screen dark component matching the provided design:
- Centered layout, black background, fixed overlay (`fixed inset-0 bg-black z-50`)
- Header: **"Enter a name. we build the timeline."** (40px, Aleo font, two lines)
- Text input with search icon, placeholder cycling through example names every 3s ("Kobe Bryant", "Muhammad Ali", "Frida Kahlo", "Albert Einstein", "Marie Curie", "Martin Luther King Jr.")
- Enter key submits the form
- Below the input: text link **"Create my own timeline"** (`text-gray-400 hover:text-white underline`)
- Loading state: "Building your timeline..." with pulse animation
- Error state: red text below input

**Props:**
```typescript
interface NewTimelineScreenProps {
  onAIGenerate: (subject: string) => void;
  onManualCreate: () => void;
  isGenerating: boolean;
  error: string | null;
}
```

### 1.2 Wired into App.tsx

**File: `src/App.tsx`**

State: `const [showCreationScreen, setShowCreationScreen] = useState(false)`

**Intercepts:**
- **Route state** (`useEffect` for `location.state`): When `state.timelineId === 'new'`, sets `showCreationScreen = true` instead of calling `switchTimeline('new')`. Covers Homepage entry point.
- **`handleTimelineSwitch`**: When `newTimelineId === 'new'`, sets `showCreationScreen = true`. Covers SidePanel entry point.
- **Draft hydration** (`useEffect` for logged-out users): When no draft exists (empty events), sets `showCreationScreen = true`. Covers first-visit.

**Handlers:**
- `handleManualCreate`: Sets `showCreationScreen = false`, calls `switchTimeline('new')` for logged-in users. For logged-out, just hides screen (empty state already exists).
- `handleAIGenerate`: Phase 2 placeholder — currently logs and falls through to manual create.

**Render:** `<NewTimelineScreen>` rendered as a fixed overlay when `showCreationScreen === true`.

---

## Phase 2: Supabase Edge Function + LLM Integration — DONE

### 2.1 Edge Function: `generate-timeline`

**New files:**
```
supabase/functions/generate-timeline/index.ts
supabase/functions/_shared/llm-client.ts
supabase/functions/_shared/prompts.ts
supabase/functions/_shared/rate-limiter.ts
supabase/functions/_shared/cors.ts
```

**`index.ts`** — HTTP handler:
- Accepts POST `{ subject: string, provider?: "openai" | "claude" }`
- Validates `x-session-token` header for rate limiting
- Calls LLM via provider abstraction
- Returns structured JSON timeline data

**`llm-client.ts`** — provider abstraction:
- `createLLMClient(provider)` factory returning `LLMClient` interface
- OpenAI: `gpt-4o` with JSON mode / structured outputs
- Claude: `claude-sonnet-4-6` with tool use for structured output
- Default provider from `DEFAULT_LLM_PROVIDER` env var

**`prompts.ts`** — prompt templates:
- System prompt instructs LLM to return JSON matching schema
- Biographical timeline events: `title` (max 55 chars), `startDate` (YYYY-MM-DD), `endDate` (YYYY-MM-DD), `category` (personal/career/education/home)
- LLM decides event count based on person's significance
- Approximate dates: use January 1st convention
- Expected response shape:
```json
{
  "timelineTitle": "Albert Einstein",
  "timelineDescription": "Key events in the life of...",
  "events": [
    { "title": "Born in Ulm, Germany", "startDate": "1879-03-14", "endDate": "1879-03-14", "category": "personal" }
  ]
}
```

**`rate-limiter.ts`** — session-based rate limiting:
- Queries `ai_rate_limits` table for session key
- 5 generations per session per 24-hour rolling window
- Logged-in: rate limit by `user_id`; logged-out: by session token

**`cors.ts`** — CORS headers helper for the frontend origin

**Environment variables (Supabase Dashboard > Edge Functions > Secrets):**
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DEFAULT_LLM_PROVIDER` (defaults to `"openai"`)

### 2.2 Database Migration: Rate Limit Table

**New file: `supabase/migrations/XXXXXX_add_ai_rate_limits.sql`**

```sql
create table ai_rate_limits (
  id uuid primary key default gen_random_uuid(),
  session_key text not null,
  created_at timestamptz default now()
);
create index idx_ai_rate_limits_session on ai_rate_limits(session_key, created_at);
```

### 2.3 Frontend Service Layer

**New file: `src/services/aiTimeline.ts`**
- Calls the edge function via `supabase.functions.invoke('generate-timeline', ...)`
- Passes auth headers for logged-in users, session token for logged-out

**New file: `src/services/sessionToken.ts`**
- Generates/retrieves UUID v4 session token from `localStorage` key `ai_session_token`

### 2.4 Custom Hook: `useAIMode`

**New file: `src/hooks/useAIMode.ts`**

```typescript
interface UseAIModeReturn {
  isGenerating: boolean;
  error: string | null;
  generate: (subject: string) => Promise<GeneratedTimeline>;
}
```

- Manages loading/error state
- Calls `aiTimeline` service
- Maps LLM response to `TimelineEvent[]` with generated UUIDs

### 2.5 Connect to App.tsx

Wire `useAIMode` into `App.tsx`:
- Replace `handleAIGenerate` placeholder with real implementation:
  1. Call `generate(subject)` → get events
  2. For logged-in: create timeline via existing `saveTimeline()` then populate state
  3. For logged-out: set events/title/description directly (localStorage autosave kicks in)
  4. Set `showCreationScreen = false` → user sees populated timeline in edit mode

### Files changed in Phase 2:
| File | Change |
|------|--------|
| `supabase/functions/generate-timeline/index.ts` | **New** — edge function handler |
| `supabase/functions/_shared/llm-client.ts` | **New** — LLM provider abstraction |
| `supabase/functions/_shared/prompts.ts` | **New** — prompt templates |
| `supabase/functions/_shared/rate-limiter.ts` | **New** — rate limiting |
| `supabase/functions/_shared/cors.ts` | **New** — CORS helper |
| `supabase/migrations/XXXXXX_add_ai_rate_limits.sql` | **New** — rate limit table |
| `src/services/aiTimeline.ts` | **New** — frontend service |
| `src/services/sessionToken.ts` | **New** — session token management |
| `src/hooks/useAIMode.ts` | **New** — React hook |
| `src/App.tsx` | Integrate `useAIMode`, wire `onAIGenerate` callback |

---

## Phase 3: Enhanced Generation (Future)

- **AI-suggested categories**: LLM proposes category labels relevant to the person instead of generic defaults
- **Regenerate / "Try Again"**: Re-call LLM for same person if user isn't happy with results
- **Detail level control**: "Brief overview" vs "Detailed biography" option on creation screen
- **Subject type extensibility**: Detect person vs topic vs event, adjust prompts accordingly (e.g., "History of Jazz")
- **Streaming responses**: SSE from edge function for incremental event rendering

---

## Data Flow

```
User types name on creation screen
        │
        ▼
  NewTimelineScreen ──onAIGenerate(name)──► useAIMode hook
        │                                       │
        │                                       ▼
        │                              aiTimeline service
        │                                       │
        │                          POST /generate-timeline
        │                                       │
        │                                       ▼
        │                            Supabase Edge Function
        │                            ├─ rate limit check
        │                            ├─ build prompt
        │                            ├─ call LLM (OpenAI or Claude)
        │                            └─ return structured JSON
        │                                       │
        │                                       ▼
        │                              Map to TimelineEvent[]
        │                              (generate UUIDs)
        │                                       │
        ▼                                       ▼
  showCreationScreen = false          Set title, description, events
        │                                       │
        ▼                                       ▼
  Timeline editor renders          Autosave (Supabase or localStorage)
  with populated events
```

---

## Verification

### Phase 1 (creation screen):
1. Log in → go to Homepage → click "Create New Timeline" → see creation screen with header, input, and "Create my own timeline" link
2. Click "Create my own timeline" → empty timeline editor (existing behavior)
3. Open SidePanel → click "Create New Timeline" → same creation screen appears
4. Log out → clear localStorage → refresh → creation screen appears on first visit
5. On creation screen, type a name and submit → shows loading state (Phase 2 placeholder falls through to manual create)

### Phase 2 (LLM integration):
1. On creation screen, type "Albert Einstein" → loading spinner → timeline populates with biographical events
2. Verify events have valid dates, titles under 55 chars, categories from the 4 defaults
3. Verify autosave works after AI generation (Supabase for logged-in, localStorage for logged-out)
4. Verify rate limiting: make 5 generations → 6th should return error
5. Test with both OpenAI and Claude providers (toggle via env var)
6. Test error states: unknown person, network failure, malformed LLM response

---

## Technical Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| LLM hallucinating dates | Convention: use Jan 1 for year-only estimates. Phase 3 adds source citations. |
| LLM returning malformed JSON | Validate response schema in edge function; return user-friendly error on parse failure. Structured output mode (OpenAI) or tool use (Claude) reduces this risk. |
| API cost overrun | Session-based rate limiting (5/day). Monitor with Supabase logs. Add hard spending caps on LLM provider dashboards. |
| Supabase Edge Function cold starts | Edge functions are Deno-based and generally fast (~100-300ms cold start). LLM latency (2-10s) dominates anyway. |
| 55-char title limit mismatch | Enforce in the prompt and validate/truncate in the edge function before returning. |
| CORS issues with edge functions | Dedicated CORS helper with appropriate headers for the frontend origin. |
