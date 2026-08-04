/*
  # Derive plan tier from app_metadata, not user_metadata

  get_user_plan previously read raw_user_meta_data->>'byok_enabled', but
  user_metadata is client-writable via supabase.auth.updateUser() — any
  authenticated user could set the flag from the browser console and jump
  from free-tier limits (300 events / 10 timelines) to byok limits
  (1200 / 25) without owning a key.

  app_metadata can only be written through the admin API; the client now goes
  through the set-byok-flag edge function (service role) to toggle it.

  Also migrates the flag for existing users and strips the now-untrusted
  copy out of user_metadata.
*/

-- Carry existing users' flag over so current BYOK users keep their limits.
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'byok_enabled',
       coalesce((raw_user_meta_data->>'byok_enabled')::boolean, false)
     )
where raw_user_meta_data ? 'byok_enabled';

-- Remove the client-writable copy so nothing can be smuggled through it.
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'byok_enabled'
where raw_user_meta_data ? 'byok_enabled';

create or replace function get_user_plan(p_user uuid)
returns text
language plpgsql
stable
as $$
declare
  v_byok boolean;
begin
  select (raw_app_meta_data->>'byok_enabled')::boolean
    into v_byok
    from auth.users
    where id = p_user;
  return case when v_byok is true then 'byok' else 'free' end;
end;
$$;
