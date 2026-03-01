/*
  # Add AI rate limits table

  Tracks AI timeline generation usage for rate limiting.
  Accessed only by Supabase Edge Functions via service role key — no RLS needed.

  1. New Table
    - `ai_rate_limits`
      - `id` (uuid, primary key)
      - `session_key` (text) — user ID or anonymous session token
      - `created_at` (timestamptz)

  2. Index
    - Composite index on (session_key, created_at) for efficient window queries
*/

create table ai_rate_limits (
  id uuid primary key default gen_random_uuid(),
  session_key text not null,
  created_at timestamptz default now()
);

create index idx_ai_rate_limits_session
  on ai_rate_limits(session_key, created_at);
