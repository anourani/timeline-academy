/*
  # Lock down ai_rate_limits

  The table was created without RLS on the assumption that only Edge Functions
  (via the service role) touch it. But tables in the `public` schema are exposed
  through PostgREST with default grants to `anon` and `authenticated`, so without
  RLS anyone holding the anon key could read every session_key (user IDs and
  device tokens), delete rows to reset their own rate limit, or insert rows to
  exhaust another user's quota.

  1. Enable RLS with no policies — the service role bypasses RLS, so Edge
     Functions keep working; every other role is denied.
  2. Revoke the default table grants from anon/authenticated as defense in depth.
  3. Retention: rows older than the 24h rate-limit window carry no purpose and
     amount to a per-user usage log. cleanup_ai_rate_limits() deletes them; the
     rate limiter calls it opportunistically on each recordUsage.
*/

alter table ai_rate_limits enable row level security;

revoke all on ai_rate_limits from anon, authenticated;

create or replace function cleanup_ai_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from ai_rate_limits where created_at < now() - interval '24 hours';
$$;

revoke execute on function cleanup_ai_rate_limits() from public, anon, authenticated;
