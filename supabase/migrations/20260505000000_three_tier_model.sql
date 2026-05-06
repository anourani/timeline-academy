/*
  # Three-Tier Access Model

  Replaces the legacy 'free'/'tier2'/'tier3' plan strings with 'free'/'byok'.
  The 'guest' tier never reaches the server (no auth.uid()) and is intentionally
  absent from get_plan_limits — the else branch covers any unexpected plan
  string defensively (including the legacy 'tier2'/'tier3' values).

  get_user_plan now resolves a user's plan from
  auth.users.raw_user_meta_data->>'byok_enabled'. The client keeps that flag
  in sync via supabase.auth.updateUser whenever a BYOK key is saved/cleared.

  Limits must stay in sync with src/constants/plans.ts.
*/

create or replace function get_plan_limits(p_plan text)
returns table(event_limit int, timeline_limit int)
language plpgsql
immutable
as $$
begin
  case p_plan
    when 'free' then
      return query select 300, 10;
    when 'byok' then
      return query select 1200, 25;
    else
      return query select 300, 10;  -- safe fallback
  end case;
end;
$$;

create or replace function get_user_plan(p_user uuid)
returns text
language plpgsql
stable
as $$
declare
  v_byok boolean;
begin
  select (raw_user_meta_data->>'byok_enabled')::boolean
    into v_byok
    from auth.users
    where id = p_user;
  return case when v_byok is true then 'byok' else 'free' end;
end;
$$;
