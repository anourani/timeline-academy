/*
  # Replace 3-Timeline Limit with Event-Based Limit + Soft Timeline Cap

  Replaces the legacy 3-timeline trigger with a per-user event budget
  (with a secondary soft cap on total timelines). Structured around
  three tiers for future billing work; only the "free" tier is wired
  up today — `get_user_plan` always returns 'free' until a user_profiles
  table is introduced.

  Overshoot behavior: "allow overshoot, then block next add." The event
  trigger is statement-level and evaluates the pre-statement count, so a
  bulk insert that starts under the limit succeeds in full even if it
  crosses the threshold. The next insert is then blocked.

  Limits must stay in sync with src/constants/plans.ts.
*/

-- Drop the legacy 3-timeline trigger + function
drop trigger if exists enforce_timeline_limit on timelines;
drop function if exists check_timeline_limit();

-- Return plan limits as (event_limit, timeline_limit).
-- NULL means "unlimited".
create or replace function get_plan_limits(p_plan text)
returns table(event_limit int, timeline_limit int)
language plpgsql
immutable
as $$
begin
  case p_plan
    when 'free' then
      return query select 150, 10;
    when 'tier2' then
      return query select 600, 25;
    when 'tier3' then
      return query select null::int, null::int;
    else
      return query select 150, 10;
  end case;
end;
$$;

-- Resolve a user's plan. TODO: swap to user_profiles.plan lookup once
-- billing is wired up.
create or replace function get_user_plan(p_user uuid)
returns text
language plpgsql
stable
as $$
begin
  return 'free';
end;
$$;

-- RPC used by the client to drive the side-panel event counter and
-- pre-flight checks. Scoped to the calling user via auth.uid().
create or replace function get_user_event_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from events e
  join timelines t on t.id = e.timeline_id
  where t.user_id = auth.uid();
$$;

grant execute on function get_user_event_count() to authenticated;

-- Statement-level BEFORE INSERT trigger on events. Counts events that
-- existed before this statement ran; if the user was already at or
-- above their limit, reject the entire statement.
create or replace function check_event_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user uuid;
  v_limit int;
  v_total int;
  v_inserting int;
  v_pre_stmt int;
begin
  select t.user_id into v_user
  from new_events ne
  join timelines t on t.id = ne.timeline_id
  limit 1;

  if v_user is null then
    return null;
  end if;

  select event_limit into v_limit from get_plan_limits(get_user_plan(v_user));
  if v_limit is null then
    return null;
  end if;

  select count(*)::int into v_total
  from events e
  join timelines t on t.id = e.timeline_id
  where t.user_id = v_user;

  select count(*)::int into v_inserting from new_events;

  v_pre_stmt := v_total - v_inserting;

  if v_pre_stmt >= v_limit then
    raise exception 'Event limit reached'
      using errcode = 'P0001', hint = 'event_limit';
  end if;

  return null;
end;
$$;

create trigger enforce_event_limit
  after insert on events
  referencing new table as new_events
  for each statement
  execute function check_event_limit();

-- Row-level BEFORE INSERT trigger on timelines to enforce the soft
-- timeline cap per plan.
create or replace function check_timeline_soft_cap()
returns trigger
language plpgsql
security definer
as $$
declare
  v_limit int;
  v_count int;
begin
  select timeline_limit into v_limit from get_plan_limits(get_user_plan(new.user_id));
  if v_limit is null then
    return new;
  end if;

  select count(*)::int into v_count
  from timelines
  where user_id = new.user_id;

  if v_count >= v_limit then
    raise exception 'Timeline limit reached'
      using errcode = 'P0001', hint = 'timeline_limit';
  end if;

  return new;
end;
$$;

create trigger enforce_timeline_soft_cap
  before insert on timelines
  for each row
  execute function check_timeline_soft_cap();
