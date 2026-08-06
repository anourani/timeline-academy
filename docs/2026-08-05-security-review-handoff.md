# Privacy & security review — session record, 5 August 2026

Context handoff for whoever picks this up next. Covers PRs #84–#89 and eleven database migrations applied by hand.

---

## 1. Summary

What began as "check the codebase for privacy red flags" found one genuine security exposure, three product features that had been silently broken in production for months, and a deployment process that had let this repo drift five months ahead of the live Supabase project without anyone noticing.

All of it is fixed and deployed. Fixing it also caused a multi-hour outage of timeline generation, which was diagnosed wrongly four times before being resolved — that post-mortem is section 5, and it's the most useful part of this document.

**Current state:** timeline generation confirmed working. Most other changes are deployed but never exercised — see section 6 before trusting anything.

---

## 2. Security findings

### The one real exposure: `ai_rate_limits`

The table was created without row-level security in the `public` schema. Supabase exposes every `public` table through PostgREST with default grants to `anon` and `authenticated`, so RLS is the only thing standing between the public anon key — which ships inside the browser bundle by design — and the table contents.

The original migration said, in a comment: *"Accessed only by Supabase Edge Functions via service role key — no RLS needed."* That describes who *does* access it, not who *can*.

Anyone who opened the site, copied the anon key from devtools, and made three requests could:

- **Read the whole table** — every row is `session_key` + timestamp, where `session_key` is either `user:<uuid>` or an anonymous device token. A user-ID enumeration plus a behavioural log of when each person used AI features.
- **Delete their own rows** — resetting their rate limit, giving unlimited generation on the project's Anthropic key.
- **Insert rows under someone else's key** — locking a victim out of AI features for 24 hours.

**Closed by** `20260803000000_lock_down_ai_rate_limits.sql`: RLS enabled with no policies (edge functions use the service role, which bypasses RLS), default grants revoked, and a 24-hour retention cleanup so the table stops accumulating a permanent per-user usage log.

### What the audit cleared

A full policy audit (`pg_policies` across the `public` schema) returned 12 rows, all `{authenticated}` and owner-scoped — `auth.uid() = user_id` on `timelines`, ownership-by-lookup on `events` and `timeline_categories`. **No policy granted anything to `anon`, and no policy used `USING (true)`.**

**No user data was ever exposed.** The worst-case scenario from the initial review — every timeline readable by anyone holding the anon key — did not happen.

### Other hardening

- **Plan tier trusted client-writable metadata.** `get_user_plan()` read `byok_enabled` from `raw_user_meta_data`, which any user can set from the browser console via `supabase.auth.updateUser()` — a self-service jump from free limits (300 events / 10 timelines) to BYOK limits (1200 / 25). Moved to `app_metadata`, writable only through the service-role `set-byok-flag` function.
- **`generate-timeline`'s classify mode had no auth and no rate limit** — unbounded, unattributed LLM spend for anyone on the internet. Now gated, with its own 30/day budget.
- **Rate limiting was forgeable and failed open.** The session key came from a client-supplied `x-session-token` header (rotate the UUID, bypass the limit), and if the counting query errored the request was allowed. Now keyed to the authenticated user only, and fails closed.
- **`fetch-event-image` was unauthenticated and unmetered.** Deleted — image lookup now runs browser-direct to Wikipedia, the same pattern the autocomplete already used.
- **Provider error bodies were relayed to callers** verbatim, potentially including account details. Now logged server-side only.
- **`xlsx@0.18.5`** (frozen on npm; prototype pollution CVE-2023-30533, ReDoS CVE-2024-22363) was parsing untrusted uploads in the origin holding the session token and BYOK key. Replaced with lazy-loaded `exceljs`.
- **Two `SECURITY DEFINER` functions** were missing `SET search_path`.

---

## 3. Three silently broken features

All three trace to one root cause: **the April–May 2026 migrations and two edge functions were never applied to the live project, while the frontend depending on them shipped normally.**

### Autosave — three months of silent data loss

A commit on **4 May** made the app write `vertical_scale` and `group_by_category` on every save (`useAutosave.ts:33-40`). Neither column existed in production. Every autosave was rejected by the database, the error was caught and logged to the console, and because the save-status indicator is disabled (`GlobalNav.tsx`, `SHOW_SAVE_STATUS = false`) nothing on screen told the user.

Nothing saved — not titles, not descriptions, not events, since the code stops at the first error before reaching the event save. **Signed-in users' work had not been persisting for three months.**

### AI event descriptions — broken since April

`enrich-event` was written on 30 April but never deployed; the last function deploy was 31 March. Opening an event auto-triggers description generation, which hit a 404 and rendered "Couldn't generate details." Every time, for every user without their own API key. The user confirmed this was a regular complaint. The columns to store results (`events.description`, `image_url`, `image_attribution`, `sources`) were also missing.

### Sharing — never worked at all

The Share button minted `/view/:id` links client-side, but **no policy ever permitted non-owner reads**. Every recipient saw "Timeline not found." Not a regression — it had never worked since the feature shipped.

Now implemented explicitly: `timelines.is_public` (default false) plus a `get_public_timeline` RPC that requires the timeline's UUID, returns no `user_id`, and leaves table policies owner-only. Unshare revokes it.

---

## 4. Everything shipped

**Security** — `ai_rate_limits` locked down; sign-in required for all server-funded AI; classify mode gated; rate limiter fails closed and is keyed to the user; CORS pinned to real origins; provider errors sanitised; `fetch-event-image` removed; plan flag moved to `app_metadata`; `search_path` pinned on `SECURITY DEFINER` functions; `xlsx` replaced.

**Privacy & compliance** — `/privacy` and `/terms` pages describing the real data flows and sub-processors (Supabase, Netlify, Anthropic, OpenAI fallback, Wikimedia), linked from the footer and the sign-in modal; account deletion via a service-role function; viewer enrichment cache now evicts at 200 entries and clears on sign-out; security headers in `netlify.toml` (CSP, Referrer-Policy, frame-ancestors, nosniff, HSTS); `no-referrer` on Wikimedia images so `/view/<uuid>` capability URLs stop leaking.

**Bug fixes found along the way** — the three above, plus: verification codes rejected as expired (the OTP input fired an attempt on every keystroke once six boxes were filled and never cleared them after a failure, so typing a fresh code over stale digits submitted five garbled ones first); Supabase's Email OTP Length was set to 8 while the UI accepts 6, meaning **nobody could sign in at all**; CSP blocked the app's own webfonts; CSV import silently dropped the first data row of non-template files (`slice(2)` on the header rows); the AIMode importer dropped malformed rows without reporting them.

**Infrastructure** — edge functions now deploy from GitHub Actions; `supabase/config.toml` checked in; custom SMTP via Resend replacing Supabase's rate-limited built-in sender; 11 migrations applied (7 catching production up to the repo, 4 new).

**Product decisions** — guest AI model changed to "sign-in + BYOK side door"; default timeline scale changed to `large`; enrichment budget raised from 5 to 30/day because descriptions auto-generate on opening an event.

---

## 5. The outage — post-mortem

Deploying the hardened `generate-timeline` broke timeline generation for several hours. The browser reported *"Failed to send a request to the Edge Function"* — a fetch that never left the browser. It was diagnosed wrongly four times.

| # | Theory | Why it was plausible | What disproved it |
|---|---|---|---|
| 1 | Mismatched `index.ts` / `_shared` files | The dashboard workflow makes partial updates easy, and the old `index.ts` imports `corsHeaders` while the new `cors.ts` exports only `corsHeadersFor` — a real incompatibility | An atomic CI deploy (#86) failed identically |
| 2 | `x-session-token` missing from the allow-list | The pre-merge site sent that header on every request; tightening `Allow-Headers` had dropped it | Added in #85; still failed |
| 3 | `verify_jwt` blocking the preflight | Genuinely true and worth fixing — the gateway rejects preflights, which carry no `Authorization` header, and replies without `content-type` | Disabled in #88; still failed |
| 4 | Function crashing or unreachable | Logs showed `EarlyDrop` shutdown events | Preflight probe returned a clean `200` |

**The actual cause:** the pre-review `cors.ts` used `Access-Control-Allow-Headers: "*"` and had worked for months. The rewrite replaced it with a hand-written list of five headers. supabase-js sends a header that wasn't on it, so the browser's preflight was refused and the request dropped before being sent.

**Why it took so long:** the `curl` probe used to "prove" the preflight was healthy requested permission for exactly the five headers the code allowed. It proved the list matched itself. A hand-written `curl` can never reproduce this class of bug, because it only asks for headers you already thought of.

**Fixed in #89** by reflecting `Access-Control-Request-Headers` back rather than maintaining a list of predictions.

### Lessons

1. **Don't tighten a request-side allow-list to match only what today's client sends.** Headers, origins, body fields — where the value isn't a real security control, prefer permissive or reflected values. A hand-written list makes the client's exact behaviour a deploy-time dependency, and the failure is invisible to server-side testing.
2. **`curl` before the browser.** CORS is browser-only, so `curl` separates "the server is broken" from "the browser refused to send." Reaching for it earlier would have saved hours — but design the probe so it *can* fail, or it proves nothing.
3. **Deploy server changes as one unit.** Hand-copying files across two systems in a particular order is not a deployment process.
4. **Two pipelines finish at different moments.** Automation makes each side reliable, not simultaneous. Backwards compatibility has to come from the code.

---

## 6. Verified vs. unverified

The verification pass was never completed — the outage consumed it. **Do not assume anything below the first list works.**

**Confirmed working**
- Timeline generation
- Sign-in end to end (6-digit code, Resend, from `login@timeline.academy`)
- CI function deploys (three green runs)
- All 11 migrations applied without error
- The CORS preflight (via `curl`)

**Deployed but never exercised**
- Sharing and unsharing end to end
- Autosave persistence after the schema catch-up — *believed* fixed, never observed
- AI event descriptions in the browser
- The anonymous sign-in-or-BYOK gate
- `/privacy` and `/terms` rendering
- `set-byok-flag`
- Security headers actually serving on production responses
- The unfiltered `events` realtime subscription in `useEventUsage.ts` — a code comment asserts Supabase Realtime enforces RLS on `postgres_changes`; plausible, unverified

**⚠️ `delete-account` — untested and destructive**

It purges the user's timelines (events and categories cascade), then rate-limit rows, then the auth record via the admin API. If any step is wrong, a user gets a partial deletion — orphaned data, or an account that half-exists. This is the one untested path where being wrong is unrecoverable.

**Test with a throwaway account before anyone can reach that button.** Afterwards confirm no rows survive in `timelines`, `events`, `timeline_categories`, `ai_rate_limits`, or `auth.users`.

---

## 7. Open items

**Operational, with dates attached**

- **Supabase access token expiry.** If a 30- or 90-day expiry was chosen when generating `SUPABASE_ACCESS_TOKEN`, CI stops deploying on that date with an opaque auth error — precisely the silent-drift failure this work exists to prevent. Record the expiry and diarise rotation.
- **Second Supabase project.** Custom SMTP was configured there by mistake during setup and may still be able to send as `timeline.academy`. Disable it.
- **Five unused Resend API keys**, three with full access, none ever used. Delete them.

**Engineering**

- **Migrations in CI** — the other half of the root cause. `supabase db push` would close it, but it needs the database password in secrets and a bad migration is far harder to undo than a bad function. Deserves its own careful sitting.
- **No test framework.** Every check is manual, which is why the drift and the three broken features persisted. Worth weighing against the cost of the incidents above.
- **Avenir never loads** — `index.css:81` points a `@font-face src` at a stylesheet URL. Fixing it changes typography across the whole interface, so it was deliberately deferred.

**Non-engineering**

- **Legal review of `/privacy` and `/terms`.** They describe the real data flows and sub-processors accurately, but they are engineering drafts.

---

## 8. Decisions worth not re-litigating

- **Sign-in required for server-funded AI, with BYOK as the anonymous side door.** A pure-BYOK model was considered and rejected: it fails the mainstream educational audience (pasting an API key is a developer flow, not a student one) and would kill sharing and persistence entirely.
- **Sharing is private by default.** Existing timelines were not grandfathered public — there was no record of which had ever been shared, and grandfathering would have meant exposing everything.
- **Enrichment at 30/day**, not 5. Descriptions auto-generate when an event is opened, so a low budget makes the feature feel broken; each result is persisted, so it's a one-time cost per event.
- **Default timeline scale `large`**, set across five places plus the column default.
- **BYOK keys stay in localStorage**, disclosed in the UI. CSP is the mitigation, not re-architecture.
- **No analytics, ever.** The absence of any tracking is the product's strongest privacy property.
