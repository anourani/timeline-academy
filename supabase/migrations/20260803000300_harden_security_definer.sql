/*
  # Pin search_path on SECURITY DEFINER trigger functions

  check_event_limit() and check_timeline_soft_cap() run as their owner but
  were created without SET search_path, leaving them open to search-path
  hijack via shadowing objects in a user-writable schema. get_user_event_count
  already pins it — this applies the same hardening to the other two.
  Function bodies are unchanged from 20260416000000_event_limit.sql.
*/

create or replace function check_event_limit()
returns trigger
language plpgsql
security definer
set search_path = public
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

create or replace function check_timeline_soft_cap()
returns trigger
language plpgsql
security definer
set search_path = public
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
