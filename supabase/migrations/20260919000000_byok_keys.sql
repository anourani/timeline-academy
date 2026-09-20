/*
  # Account-synced BYOK keys

  BYOK keys lived only in the browser's localStorage, which made them a
  property of the device rather than of the account. A user who added a key on
  their laptop and then signed in on their phone found the premium models
  locked and their timelines generating on our server budget — and worse, the
  old client reconciled `byok_enabled` down to `false` from the key-less
  device, silently demoting the whole account to Free limits until the first
  device re-saved the key.

  Keys now live with the account, ciphertext only. The `byok-keys` Edge
  Function is the only thing that touches these tables: it holds the
  `BYOK_ENCRYPTION_KEY` secret, and it derives `byok_enabled` from whether any
  row exists, so the flag can no longer disagree with reality.

  1. `user_byok_keys` — one row per (user, provider). `ciphertext` is base64
     AES-256-GCM output with the auth tag appended; `iv` is 12 fresh random
     bytes per write, base64. The plaintext key never lands in a column.
  2. `user_byok_settings` — the chosen model id, per user. Opaque to the
     server: `generate-timeline` still never reads a model, this is only
     preference storage so the dropdown agrees across devices.
  3. RLS on with **no policies**, and the default PostgREST grants revoked.
     The service role bypasses RLS, so the function keeps working; every other
     role — including a holder of the anon key — is denied. Same shape as
     `ai_rate_limits`, and for the same reason.

  `delete-account` needs no change: both tables cascade from `auth.users`.
*/

create table if not exists public.user_byok_keys (
  user_id    uuid not null references auth.users(id) on delete cascade,
  provider   text not null check (provider in ('anthropic', 'openai')),
  ciphertext text not null,
  iv         text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table if not exists public.user_byok_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  model      text,
  updated_at timestamptz not null default now()
);

alter table public.user_byok_keys enable row level security;
alter table public.user_byok_settings enable row level security;

revoke all on public.user_byok_keys from anon, authenticated;
revoke all on public.user_byok_settings from anon, authenticated;
