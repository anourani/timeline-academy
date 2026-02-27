# PRD: AI Mode — Generate Timelines from a Person's Name

## Overview

Add an **AI mode** to Timeline Academy that lets users type a person's name (e.g., "Albert Einstein") and have an LLM automatically generate a timeline of that person's life events. This is a distinct mode from the existing manual timeline-building experience, focused on **reducing the blank-canvas problem** by giving users a pre-populated starting point. Once generated, the user transitions to the existing edit mode for manual customization.

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

## Current Architecture (Relevant Context)

- **Frontend**: React 18 SPA, TypeScript, Vite, Tailwind CSS
- **Backend**: Supabase only (PostgreSQL + Auth). No traditional server.
- **Deployment**: Netlify
- **No existing AI/LLM integration**
- **Event model**: `{ id, title, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), category }`
- **Category model**: `{ id, label, color, visible }` — 4 defaults: Category 1-4 with purple/orange/green/blue colors
- **Timeline model**: `{ id, title, description, scale, categories (JSONB), user_id }`
- **Logged-out users**: localStorage draft with single timeline
- **Logged-in users**: Up to 3 timelines saved to Supabase
- **Existing modes** (informal): Edit (main `/` route) and Present (`/view/:timelineId`)

---

## Phased Implementation Plan

### Phase 1: MVP — "Type a Name, Get a Timeline"

**Goal**: End-to-end flow where a user types a person's name and receives a pre-populated timeline.

#### 1.1 Supabase Edge Function: `generate-timeline`

Create a new Supabase Edge Function that:
- Accepts a POST request with `{ subject: string, provider?: "openai" | "claude" }`
- Validates the session token for rate limiting (see 1.3)
- Calls the selected LLM API with a structured prompt
- Returns a JSON response with generated timeline data

**New files:**
```
supabase/
  functions/
    generate-timeline/
      index.ts          # Edge function handler
    _shared/
      llm-client.ts     # Provider abstraction (OpenAI + Claude)
      prompts.ts         # Prompt templates
      rate-limiter.ts    # Session-based rate limiting
      cors.ts            # CORS headers helper
```

**LLM prompt strategy:**
- System prompt instructs the LLM to return structured JSON
- The prompt asks for biographical timeline events with: `title` (max 55 chars), `startDate` (YYYY-MM-DD), `endDate` (YYYY-MM-DD), `category` (one of: personal, career, education, home)
- The LLM decides the appropriate number of events based on the person's historical significance
- Dates should be as precise as available; for approximate dates, use January 1st of the year as a convention
- Response format:

```json
{
  "timelineTitle": "Albert Einstein",
  "timelineDescription": "Key events in the life of Albert Einstein (1879-1955), theoretical physicist who developed the theory of relativity.",
  "events": [
    {
      "title": "Born in Ulm, Germany",
      "startDate": "1879-03-14",
      "endDate": "1879-03-14",
      "category": "personal"
    }
  ]
}
```

**LLM provider abstraction (`_shared/llm-client.ts`):**
```typescript
interface LLMClient {
  generateTimeline(subject: string): Promise<GeneratedTimeline>;
}
```
- Factory function `createLLMClient(provider)` returns the appropriate client
- OpenAI client: Uses `gpt-4o` with JSON mode / structured outputs
- Claude client: Uses `claude-sonnet-4-6` with tool use for structured output
- Default provider configurable via env var `DEFAULT_LLM_PROVIDER`

**Environment variables (set in Supabase Dashboard > Edge Functions > Secrets):**
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DEFAULT_LLM_PROVIDER` (defaults to `"openai"`)

#### 1.2 Frontend: AI Mode Service Layer

Create a service module that the frontend calls to invoke the edge function.

**New files:**
```
src/
  services/
    aiTimeline.ts       # Calls the Supabase Edge Function
    sessionToken.ts     # Manages anonymous session token
```

**`aiTimeline.ts`** — calls the edge function:
```typescript
interface GenerateTimelineRequest {
  subject: string;
  provider?: "openai" | "claude";
}

interface GeneratedTimeline {
  timelineTitle: string;
  timelineDescription: string;
  events: Array<{
    title: string;
    startDate: string;
    endDate: string;
    category: string;
  }>;
}

async function generateTimeline(req: GenerateTimelineRequest): Promise<GeneratedTimeline>
```

Uses the Supabase client's `functions.invoke()` method to call the edge function, which handles auth headers automatically for logged-in users. For logged-out users, passes the session token as a custom header.

#### 1.3 Rate Limiting: Session-Based Token

**Mechanism:**
- On first visit (or first AI mode use), generate a UUID v4 token and store it in `localStorage` under key `ai_session_token`
- Pass this token as an `x-session-token` header on every edge function call
- The edge function tracks usage in a new Supabase table `ai_rate_limits`
- Rate limit: **5 generations per session per 24-hour rolling window** (configurable)
- For logged-in users, rate limit by `user_id` instead (more reliable)

**New database table:**
```sql
create table ai_rate_limits (
  id uuid primary key default gen_random_uuid(),
  session_key text not null,        -- session token or user_id
  created_at timestamptz default now()
);

create index idx_ai_rate_limits_session on ai_rate_limits(session_key, created_at);
```

#### 1.4 Frontend: Mode State Management

Introduce a formal `mode` concept to the app.

**Changes to `src/App.tsx`:**
- Add state: `const [mode, setMode] = useState<'edit' | 'ai'>('edit')`
- AI mode state: `const [isGenerating, setIsGenerating] = useState(false)`
- When in AI mode and user submits a name:
  1. Call `generateTimeline({ subject: name })`
  2. Set `isGenerating = true` (shows loading state)
  3. On response: map events to `TimelineEvent[]` (generate UUIDs for IDs), set title/description/events
  4. Set `isGenerating = false`
  5. Switch `mode` to `'edit'` — user now has full manual editing tools
- The mode toggle and AI input UI will be designed later (user will provide screenshot)

**Key behavior:**
- AI mode generates a **new timeline** — it replaces the current empty state
- If the user already has events, prompt confirmation before overwriting
- Generated events get client-side UUIDs, same as manual events
- After generation, autosave kicks in normally (Supabase for logged-in, localStorage for logged-out)

#### 1.5 New Custom Hook: `useAIMode`

**New file: `src/hooks/useAIMode.ts`**

Encapsulates AI mode logic:
```typescript
interface UseAIModeReturn {
  isGenerating: boolean;
  error: string | null;
  generate: (subject: string) => Promise<GeneratedTimeline>;
}
```

This hook:
- Manages loading/error state
- Calls the `aiTimeline` service
- Handles session token management
- Maps the LLM response into `TimelineEvent[]` format with generated UUIDs

---

### Phase 2: Enhanced Generation — Better Categories + Refinement

**Goal**: Improve the quality and customization of generated timelines.

#### 2.1 AI-Suggested Categories

Instead of mapping to the 4 default categories, the LLM suggests categories relevant to the person:
- The prompt asks the LLM to also return `suggestedCategories` alongside events
- Example for Einstein: `["Early Life", "Scientific Work", "Personal Life", "Awards & Recognition"]`
- Each suggested category maps to one of the 4 color slots
- The frontend auto-creates `CategoryConfig` entries with the suggested labels

**Prompt change**: Add a `suggestedCategories` field to the expected JSON output:
```json
{
  "suggestedCategories": [
    { "id": "category_1", "label": "Early Life" },
    { "id": "category_2", "label": "Scientific Work" },
    { "id": "category_3", "label": "Personal Life" },
    { "id": "category_4", "label": "Awards & Legacy" }
  ]
}
```

#### 2.2 Regeneration / "Try Again"

- Add a "Regenerate" action that re-calls the LLM for the same person
- Useful if the user isn't happy with the initial result
- Counts against rate limit

#### 2.3 Detail Level Control

Let users optionally specify a detail level:
- "Brief overview" → fewer events, major milestones only
- "Detailed biography" → more events, minor events included
- Passed as a parameter to the edge function and incorporated into the prompt

---

### Phase 3: Extensibility — Beyond People

**Goal**: Support non-person subjects and improve accuracy.

#### 3.1 Subject Type Detection

The edge function detects whether the subject is a person, an event, a movement, etc. and adjusts the prompt accordingly:
- Person → biographical timeline
- Event → "History of X" timeline
- Topic → key milestones/developments timeline

This is where the extensible architecture pays off — the `prompts.ts` module has different prompt templates per subject type.

#### 3.2 Streaming Responses

Instead of waiting for the full LLM response, stream events to the frontend as they're generated:
- Use Server-Sent Events (SSE) from the edge function
- Frontend renders events incrementally as they arrive
- Better UX for longer generations

#### 3.3 Source Citations (Stretch)

Include optional source/context for each event so users can verify:
- LLM returns a `source` or `context` field per event
- Displayed as a tooltip or detail panel in edit mode
- Helps with the accuracy/hallucination concern

---

## Data Flow Diagram

```
┌─────────────┐     POST /generate-timeline      ┌────────────────────────┐
│   Frontend   │ ──────────────────────────────── │  Supabase Edge Function │
│              │  { subject, provider?, token }    │                        │
│  React SPA   │                                  │  1. Validate rate limit │
│              │                                  │  2. Build prompt        │
│              │  ◄──────────────────────────────  │  3. Call LLM API       │
│              │  { title, description, events[] } │  4. Parse response     │
│              │                                  │  5. Return JSON         │
│  Map to       │                                  └───────────┬────────────┘
│  TimelineEvent[]                                             │
│  with UUIDs   │                                              │
│              │                                   ┌───────────▼───────────┐
│  Set state ──►│── autosave ──────────────────── │  Supabase PostgreSQL   │
│  (events,    │                                  │  (timelines, events)   │
│   title,     │                                  └────────────────────────┘
│   categories)│
│              │── localStorage (if logged out)
└─────────────┘
```

---

## Files Changed / Created Summary

### New Files

| File | Purpose |
|------|---------|
| `supabase/functions/generate-timeline/index.ts` | Edge function: HTTP handler, orchestrates LLM call |
| `supabase/functions/_shared/llm-client.ts` | LLM provider abstraction (OpenAI + Claude) |
| `supabase/functions/_shared/prompts.ts` | Prompt templates for timeline generation |
| `supabase/functions/_shared/rate-limiter.ts` | Session-based rate limiting logic |
| `supabase/functions/_shared/cors.ts` | CORS headers for edge functions |
| `supabase/migrations/XXXXXX_add_ai_rate_limits.sql` | Rate limit tracking table |
| `src/services/aiTimeline.ts` | Frontend service to call edge function |
| `src/services/sessionToken.ts` | Anonymous session token management |
| `src/hooks/useAIMode.ts` | React hook for AI mode state/logic |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add `mode` state, wire up AI mode flow, integrate `useAIMode` |
| `src/types/event.ts` | (Phase 2) May need to extend `TimelineCategory` type if AI suggests custom categories |

### No Changes Needed

| File | Why |
|------|-----|
| `src/utils/saveEvents.ts` | AI-generated events are standard `TimelineEvent[]` — existing save logic works |
| `src/hooks/useTimeline.ts` | Timeline creation/save logic already handles new timelines |
| `src/hooks/useEvents.ts` | `setEvents()` already exists for bulk event setting |
| Database schema (timelines/events) | No structural changes needed; AI events are regular events |

---

## Open Questions (To Revisit)

1. **UI/UX**: Where does the AI mode input live? User will provide screenshot later.
2. **Category labels in Phase 1**: Should we use the generic "Category 1-4" labels or rename them to something like "Personal Life, Career, Education, Major Events" by default for AI-generated timelines?
3. **Error messaging**: What should the user see if the LLM doesn't recognize a name or returns poor results?
4. **Provider selection**: Should the user be able to choose between OpenAI and Claude in the UI, or is this purely a backend config?
5. **Cost monitoring**: Beyond rate limiting, do we need usage tracking/alerts for LLM API spend?

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
