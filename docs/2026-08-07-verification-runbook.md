# Verification runbook — 7 August 2026

Follow-up to `2026-08-05-security-review-handoff.md`. That document ends with a
list of things that were deployed but never actually run (its section 6). This
one is the procedure for running them, in priority order, written to be followed
step by step.

Two ground rules carried over from the outage post-mortem:

- **Get evidence before forming a theory.** Every step below says what result
  proves the thing works, and what to capture if it doesn't.
- **Never assume a migration was applied.** Step 0 checks the live schema
  before anything else, because the three-month data-loss bug was invisible
  from the repo.

---

## 0. Before anything: confirm the live schema

Every check further down assumes the April–May 2026 columns actually exist in
production. The handoff says all 11 migrations were applied without error, but
that claim has never been re-checked, and this is the exact failure that cost
three months last time.

**Where:** Supabase dashboard → your project → **SQL Editor** → **New query**.
Paste, press **Run**.

```sql
-- Expect exactly 9 rows. Any missing row means a migration did not apply.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('timelines', 'description'),
    ('timelines', 'scale'),
    ('timelines', 'vertical_scale'),
    ('timelines', 'group_by_category'),
    ('timelines', 'is_public'),
    ('events', 'description'),
    ('events', 'image_url'),
    ('events', 'image_attribution'),
    ('events', 'sources')
  )
order by table_name, column_name;
```

```sql
-- Expect exactly 5 rows: the RPCs and helper functions the app depends on.
select proname as function_name
from pg_proc
where proname in (
  'get_public_timeline',
  'cleanup_ai_rate_limits',
  'get_user_event_count',
  'get_plan_limits',
  'get_user_plan'
)
order by proname;
```

```sql
-- ai_rate_limits must have RLS ON and ZERO policies. That combination is what
-- locks it: edge functions use the service role, which bypasses RLS, and
-- everyone else — including anyone holding the public anon key — is denied.
--
-- "Zero policies" ALONE proves nothing. Zero policies with RLS *off* is the
-- opposite: the table is readable by the whole internet. That is the exposure
-- this migration closed, so check both together.
--
-- Written as one query on purpose. The Supabase SQL editor only shows the
-- result of the LAST statement, so two separate selects will silently hide
-- the first answer.
select
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'ai_rate_limits') as policy_count,
  case
    when c.relrowsecurity
     and (select count(*) from pg_policies
           where schemaname = 'public' and tablename = 'ai_rate_limits') = 0
      then 'PASS — RLS on, no policies, locked to the service role'
    when not c.relrowsecurity
      then 'FAIL — RLS is OFF. Anyone with the anon key can read this table.'
    else 'CHECK — RLS on but policies exist; read them before trusting this.'
  end as verdict
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relname = 'ai_rate_limits'
  and n.nspname = 'public';
```

```sql
-- Defence in depth: the migration also revoked the default PostgREST grants.
-- Expect ZERO rows. Any row here means anon or authenticated still holds a
-- direct grant on the table.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'ai_rate_limits'
  and grantee in ('anon', 'authenticated');
```

**If any row is missing, stop.** The corresponding migration in
`supabase/migrations/` was never applied. Do not proceed to the deletion test —
open the migration file, paste its contents into the SQL Editor, and run it
first.

---

## 1. `delete-account` — the destructive one

### What I confirmed by reading the code and the deploy logs

These are facts, not reassurance:

- **The function is live.** CI run #3 (5 Aug 2026, 02:17:52 UTC) logged
  `Deployed Functions on project ***: delete-account, enrich-event,
  generate-timeline, set-byok-flag`. The copy of `delete-account/index.ts` on
  `main` today is byte-identical to the commit that deploy shipped (`6ed3292`).
  So the button in the account panel reaches working, current code.
- **The delete order is correct for the actual schema.**
  `timelines.user_id` references `auth.users(id)` with **no** `on delete
  cascade`, so the auth record genuinely cannot be deleted while timelines
  exist. The function deletes timelines first, which is right.
- **`events` and `timeline_categories` will cascade.** Both have
  `timeline_id uuid references timelines(id) on delete cascade`.
- **The rate-limit purge covers every key format actually in use.** The
  function deletes `user:<id>`, `enrich:user:<id>` and `classify:user:<id>`.
  Those are exactly the three strings `generate-timeline` and `enrich-event`
  write — no fourth format exists anywhere in `supabase/functions/`.
- **Nothing blocks a delete.** Both database triggers
  (`enforce_event_limit`, `enforce_timeline_soft_cap`) fire on INSERT only.
- **Only four tables hold user data**, and only `timelines` points at
  `auth.users`. There is no fifth table waiting to be orphaned.

### What is still unproven

Whether it actually runs. Code review cannot tell you that, and the previous
session's four wrong diagnoses were all code-review-plausible. The test below
is the only thing that settles it.

### The one real hazard, and how to not hit it

**The function deletes whoever is signed in — it reads the user ID from the
session token, not from anything you type.** It cannot be pointed at another
account, which is good, but it also means that if you run it while signed in
as your own account, you delete your own account.

Mitigations, in order of importance:

1. **Do the whole test in a private / incognito window.** Your normal browser
   stays signed in as you and is never involved.
2. **Use a throwaway email you control.** A Gmail plus-address works:
   `nourani1alex+deltest@gmail.com` delivers to your normal inbox but is a
   completely separate account as far as Supabase is concerned. Signing in
   with an email that has never been used creates the account automatically.
3. **Before clicking Delete, re-check the email shown in the account panel.**
   It should be the `+deltest` address.

**What breaks if it goes wrong:** for the throwaway account, nothing of value —
that is the entire point of using one. The genuine risk is deleting the wrong
account, which the incognito window prevents. There is **no undo** for a
completed deletion: the auth record is hard-deleted and the timelines are gone.
This test changes no code, no config and no production setting, so there is
nothing to roll back afterwards.

### Step-by-step

**Step 1 — create the throwaway account and give it data.**

1. Open a **private / incognito window** and go to the live site.
2. Sign in with `nourani1alex+deltest@gmail.com`. Enter the 6-digit code from
   your inbox.
3. Generate or build **at least one timeline with several events**, so there is
   real data to delete. Open one event so a description is generated — that
   also writes an `enrich:user:<id>` rate-limit row, which the test needs.
4. Leave this window open and signed in.

**Step 2 — capture the baseline.** In the SQL Editor:

```sql
select id, email, created_at
from auth.users
where email = 'nourani1alex+deltest@gmail.com';
```

**Copy the `id` value.** You need it after the deletion, when the account no
longer exists to look up by email. Paste it into the query below in place of
`PASTE-UUID-HERE`.

```sql
with u as (select 'PASTE-UUID-HERE'::uuid as id)
select
  (select count(*) from timelines where user_id = u.id) as timelines,
  (select count(*) from events e
     join timelines t on t.id = e.timeline_id
    where t.user_id = u.id) as events,
  (select count(*) from timeline_categories c
     join timelines t on t.id = c.timeline_id
    where t.user_id = u.id) as categories,
  (select count(*) from ai_rate_limits
    where session_key in ('user:' || u.id,
                          'enrich:user:' || u.id,
                          'classify:user:' || u.id)) as rate_limit_rows,
  (select count(*) from auth.users where id = u.id) as auth_rows
from u;
```

Write these five numbers down. `timelines`, `events` and `auth_rows` must all
be **greater than zero** or the test proves nothing.

> **Note on `timeline_categories`:** nothing in the app writes to that table any
> more — categories now live in a `categories` column on `timelines`, and
> `timeline_categories` is only ever read. So its baseline will be `0`, and a
> `0` afterwards would prove nothing. To actually exercise the cascade, insert
> one row by hand first:
>
> ```sql
> insert into timeline_categories (timeline_id, category_id, label, color, "order")
> select id, 'test-cat', 'Cascade test', '#888888', 0
> from timelines
> where user_id = 'PASTE-UUID-HERE'::uuid
> limit 1;
> ```
>
> Then re-run the baseline query — `categories` should now be `1`.

**Step 3 — delete.** Back in the incognito window:

1. Open the account panel.
2. **Check the email shown is the `+deltest` address.**
3. Click **Delete account**, then confirm.
4. Note exactly what you see: the success alert (*"Your account and all its
   data have been deleted."*), the failure alert, or nothing at all.

**Step 4 — confirm nothing survived.** In the SQL Editor, same UUID:

```sql
with u as (select 'PASTE-UUID-HERE'::uuid as id)
select
  (select count(*) from timelines where user_id = u.id) as timelines_left,
  (select count(*) from events e
     join timelines t on t.id = e.timeline_id
    where t.user_id = u.id) as events_left,
  (select count(*) from timeline_categories c
     join timelines t on t.id = c.timeline_id
    where t.user_id = u.id) as categories_left,
  (select count(*) from ai_rate_limits
    where session_key in ('user:' || u.id,
                          'enrich:user:' || u.id,
                          'classify:user:' || u.id)) as rate_limit_rows_left,
  (select count(*) from auth.users where id = u.id) as auth_rows_left
from u;
```

**All five must be `0`.** This query always returns exactly one row, so a row
of zeroes is a real pass, not an empty result.

Then check for anything orphaned globally — this should be impossible given the
foreign keys, but it is cheap and it is the thing you actually want to know:

```sql
select
  (select count(*) from events e
     left join timelines t on t.id = e.timeline_id
    where t.id is null) as orphaned_events,
  (select count(*) from timeline_categories c
     left join timelines t on t.id = c.timeline_id
    where t.id is null) as orphaned_categories,
  (select count(*) from timelines t
     left join auth.users u on u.id = t.user_id
    where u.id is null) as timelines_with_no_user;
```

All three must be `0`.

Finally, one thing the handoff did not think to check — Supabase's own auth
audit log, which is separate from your tables:

```sql
select count(*) as audit_rows_mentioning_the_email
from auth.audit_log_entries
where payload::text ilike '%nourani1alex+deltest@gmail.com%';
```

If this is greater than zero, the email address survives account deletion
inside GoTrue's log. That is Supabase's internal table rather than app data,
but `/privacy` currently says deletion is *"immediate and permanent"* and
includes *"your email"* — so the number matters. See section 4.

### If it fails

Do not guess. Collect these three things first — between them they identify
the failing step precisely:

1. **The edge function log.** Supabase dashboard → **Edge Functions** →
   **delete-account** → **Logs**, filtered to the last few minutes. The
   function logs a distinct line per step:
   `delete-account: timelines purge failed:` /
   `delete-account: rate-limit purge failed:` /
   `delete-account: auth delete failed:`. Whichever appears tells you exactly
   where it stopped.
2. **The browser console.** In the incognito window, right-click → Inspect →
   Console tab. Look for `Failed to delete account:` and copy the whole error.
3. **A `curl` probe**, to separate "the server is broken" from "the browser
   refused to send" — the distinction that cost hours last time. Open Terminal
   and paste this. It sends **no credentials**, so it cannot delete anything:

```bash
curl -i -X OPTIONS \
  https://ltudgurcouffxyuxvpmw.supabase.co/functions/v1/delete-account \
  -H "Origin: https://app.timeline.academy" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, x-client-info, apikey, content-type, x-made-up-header"
```

Expected: `HTTP/2 200`, with `access-control-allow-origin:
https://app.timeline.academy` and an `access-control-allow-headers` line that
**includes `x-made-up-header`**. The made-up header is deliberate — it is what
makes this probe capable of failing. If it comes back, the function is
reflecting the browser's requested headers as designed, and CORS is not your
problem. (The previous session's probe only asked for headers the code already
allowed, which is why it proved nothing.)

Then:

```bash
curl -i -X POST \
  https://ltudgurcouffxyuxvpmw.supabase.co/functions/v1/delete-account \
  -H "Origin: https://app.timeline.academy"
```

Expected: `HTTP/2 401` and `{"error":"Authentication required."}`. That proves
the function is deployed, reachable, running current code, and refusing
anonymous callers. If you get a 404, it is not deployed. If you get a 500, the
function is crashing before it reads the auth header.

---

## 2. The rest of the verification pass

Do these **after** the deletion test, using a **second** throwaway account
(`+verify` rather than `+deltest`) so you still have one to delete later if
needed. None of these is destructive.

### 2a. Autosave persistence — the three-month data-loss bug

This is the one worth being most careful about, because **the app gives you no
feedback either way**: the save-status indicator is switched off
(`GlobalNav.tsx:63`, `SHOW_SAVE_STATUS = false`), so a failed save looks
identical to a successful one. Reloading the same tab is *not* a valid check
either — a local draft can make an unsaved timeline look saved.

The only trustworthy check is the database.

1. Signed in as the verify account, open a timeline in the editor.
2. Change the **title**, edit an **event**, and change the **vertical scale**
   and the **group-by-category** toggle. Those last two are the exact columns
   whose absence broke saving in May.
3. Wait about 5 seconds — saving is debounced by 2 seconds.
4. Run this, substituting the account's email:

```sql
select t.title, t.description, t.scale, t.vertical_scale, t.group_by_category,
       t.updated_at, count(e.id) as event_count
from timelines t
left join events e on e.timeline_id = t.id
join auth.users u on u.id = t.user_id
where u.email = 'nourani1alex+verify@gmail.com'
group by t.id, t.title, t.description, t.scale, t.vertical_scale,
         t.group_by_category, t.updated_at
order by t.updated_at desc;
```

**Pass:** the title matches what you typed, `vertical_scale` and
`group_by_category` match the toggles, and `updated_at` is within the last
minute. **Fail:** `updated_at` is old, or values are stale — meaning the write
is still being rejected. If it fails, the browser console will have
`Save error:` with the database's reason; capture that.

### 2b. Sharing and unsharing

1. Signed in as the verify account, click **Share** on a timeline. The link is
   copied to your clipboard.
2. Confirm the database agrees:

```sql
select id, title, is_public from timelines
where user_id = (select id from auth.users
                 where email = 'nourani1alex+verify@gmail.com');
```

`is_public` must be `true` for that timeline.

3. Paste the link into a **different browser** (or a second incognito window
   where you are signed out). It must render the timeline — not "Timeline not
   found".
4. Back in the first window, **Unshare**. Re-run the query: `is_public` must be
   `false`.
5. Reload the shared link in the signed-out window. It must now fail to load.

That last step is the one that actually matters — it proves revocation works,
which is the whole security property of the feature.

### 2c. AI event descriptions in the browser

1. Signed in as the verify account, open an event that has no description.
2. A description should generate within a few seconds. **Fail** looks like
   *"Couldn't generate details."*
3. Confirm it persisted:

```sql
select e.title, left(e.description, 60) as description_start,
       e.image_url is not null as has_image
from events e
join timelines t on t.id = e.timeline_id
join auth.users u on u.id = t.user_id
where u.email = 'nourani1alex+verify@gmail.com'
  and e.description is not null;
```

If it fails, the evidence is in **Edge Functions → enrich-event → Logs**, not
in guesswork. Rate limit is 30/day per user, so repeated testing can exhaust
it — a 429 means the limit, not a bug.

### 2d. Cheap extras while you are in there

- **Security headers.** In Terminal:
  `curl -sI https://app.timeline.academy | grep -i "content-security-policy\|strict-transport\|x-frame\|referrer"`.
  All four should appear. This is pure read-only.
- **`/privacy` and `/terms`** — just visit both and confirm they render and
  are linked from the footer and the sign-in modal.
- **The anonymous gate** — signed out, in incognito, click Generate. You should
  get the sign-in-or-BYOK choice, not an error.

---

## 3. Operational loose ends

### 3a. Supabase access token expiry — RESOLVED, 7 Aug 2026

**Checked: the token is set to never expire.** The failure this open item
existed to prevent — CI silently stopping on an unrecorded expiry date — cannot
happen. No rotation reminder is needed to keep deploys alive, and this item is
closed.

Last successful deploy: 5 Aug 2026, 02:17 UTC. Three runs, all green.

What remains is a smaller, different risk, recorded here rather than acted on:
a non-expiring token is a permanent credential with full access to the Supabase
account, held in GitHub Actions secrets. The trade-off was made in the right
direction — a silently-dead deploy pipeline is the more likely and more
damaging failure for a project this size. If you ever want to reduce the
standing exposure, the move is an annual rotation on a calendar reminder, not
a short expiry.

The only remaining way CI dies quietly is accidental revocation, which is
noisy in a different way: the deploy fails visibly on the next merge.

**A stronger check, if you want certainty rather than inference:** trigger the
deploy workflow by hand from the GitHub Actions tab (**Deploy Supabase Edge
Functions** → **Run workflow**). It redeploys the exact code already running,
so a success changes nothing, and a failure proves the token is dead *now*
rather than at the worst possible moment. **What breaks if it goes wrong:**
practically nothing — the deploy is per-function and atomic, and it is
deploying byte-identical code. **Undo:** none needed; if it somehow failed
mid-way, re-running it restores the same state.

### 3b. Custom SMTP on the second Supabase project

The risk is a second project able to send email as `timeline.academy` — a
spoofing surface with no legitimate use.

1. Open **https://supabase.com/dashboard** and switch to the *other* project
   (not `ltudgurcouffxyuxvpmw`).
2. **Project Settings** → **Authentication** → **SMTP Settings**.
3. Screenshot the settings before changing anything — that is your undo.
4. Turn **Enable Custom SMTP** off. Save.

**What breaks if it goes wrong:** if you disable it on the *wrong* project,
sign-in emails for the live app stop sending and nobody can log in. Check the
project ref in the URL is **not** `ltudgurcouffxyuxvpmw` before you touch
anything. **Undo:** re-enable and re-enter the settings from your screenshot.

### 3c. Delete the five unused Resend API keys

1. Go to **https://resend.com/api-keys**.
2. Identify the key Supabase actually uses: open the live project's SMTP
   settings (`ltudgurcouffxyuxvpmw` → Authentication → SMTP) and look at the
   password field. **Do not delete that one.**
3. Delete the others, one at a time.

**What breaks if it goes wrong:** deleting the in-use key stops all sign-in
emails immediately — nobody can log in. **Undo:** create a new Resend key and
paste it into the Supabase SMTP password field; sign-in recovers within a
minute or two. Keep the live project's SMTP page open in a second tab while
you do this.

Verify afterwards by signing in with a fresh throwaway address and confirming
the code still arrives.

---

## 4. Things worth fixing, once the tests above have run

Deliberately not changed yet — the point of this session is evidence first.

1. **The half-deleted window in `delete-account`.** If the timelines purge
   succeeds and the auth deletion then fails, the user's content is gone but
   their account remains, and the message says only *"Please try again."*
   Retrying does complete the deletion, so it self-heals — but nothing tells
   the user or us that they are in that state. Worth making the response say
   which step failed, and logging it loudly.
2. **`auth.audit_log_entries` may retain the deleted email** (query in section
   1). If it does, `/privacy`'s *"immediate and permanent"* wording is slightly
   ahead of reality. Either prune those rows as part of deletion, or soften the
   wording. This is a small thing that a privacy-focused product should get
   right.
3. **`timeline_categories` is dead weight.** Nothing writes to it; the app only
   reads it. It is an empty table with RLS policies and a cascade nobody
   exercises. Either drop it or document it as legacy.
4. **The save-status indicator is off** (`SHOW_SAVE_STATUS = false`). It is the
   reason three months of data loss went unnoticed, and it is still off. Turning
   it back on is the cheapest possible insurance against a repeat.
