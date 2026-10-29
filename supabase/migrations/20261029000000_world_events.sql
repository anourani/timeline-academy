/*
  # World Events: per-timeline settings for the context lane

  The World Events lane sits under a timeline and shows, read-only, what else
  was happening across the timeline's year range — in one country's national
  history, in the world, or in science and technology. The events themselves
  are fetched on demand (the `world-events` Edge Function, or browser-direct
  for BYOK) and never stored. Only the timeline's settings are:

    - `show_world_events`    — whether the lane is on (off by default)
    - `world_event_sources`  — which of country / world / science to show
    - `world_event_country`  — ISO 3166-1 alpha-2 code for the country source

  APPLY BY HAND in the Supabase SQL editor, like every migration here —
  nothing applies or verifies them. Check afterwards with:

    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'timelines'
      and column_name like '%world_event%';

  The client tolerates this being unapplied. The settings are written by their
  own best-effort update, never as part of the insert or autosave's update (the
  same pattern as `is_ai_generated`), so a missing column costs the settings,
  not every save. Every reader normalizes what it gets back, so absent fields
  read as the defaults below.

  Two places change together:

  1. the columns themselves,
  2. `get_public_timeline`, which hand-builds its payload column by column and
     would otherwise leave /view/:id blind to the lane. Recreated from its
     latest definition (20260908000000_timeline_chapters.sql) with the three
     settings added; `user_id` is still never returned.

  The `timelines_set_updated_at` WHEN clause is deliberately left alone. It
  skips the stamp only when `is_public` changed and none of the listed columns
  did; an update that changes the world-event settings without touching
  `is_public` therefore stamps `updated_at` like any edit (as a
  `group_by_category` change does), which is the intended behavior.

  Idempotent: safe to run more than once.
*/

alter table public.timelines
  add column if not exists show_world_events boolean not null default false;

alter table public.timelines
  add column if not exists world_event_sources text[] not null default '{world}';

alter table public.timelines
  add column if not exists world_event_country text not null default 'US';

-- Constraints are dropped and re-added so a re-run (or a corrected rule)
-- always leaves exactly one current definition.
alter table public.timelines
  drop constraint if exists timelines_world_event_sources_check;

alter table public.timelines
  add constraint timelines_world_event_sources_check
  check (
    cardinality(world_event_sources) > 0
    and world_event_sources <@ array['country', 'world', 'science']::text[]
  );

alter table public.timelines
  drop constraint if exists timelines_world_event_country_check;

alter table public.timelines
  add constraint timelines_world_event_country_check
  check (world_event_country ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------------------
-- Public read path
-- ---------------------------------------------------------------------------

create or replace function get_public_timeline(p_timeline_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'timeline', jsonb_build_object(
      'title', t.title,
      'description', t.description,
      'categories', t.categories,
      'chapters', t.chapters,
      'scale', t.scale,
      'vertical_scale', t.vertical_scale,
      'group_by_category', t.group_by_category,
      'show_world_events', t.show_world_events,
      'world_event_sources', to_jsonb(t.world_event_sources),
      'world_event_country', t.world_event_country
    ),
    'events', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'start_date', e.start_date,
            'end_date', e.end_date,
            'category', e.category,
            'description', e.description,
            'image_url', e.image_url,
            'image_attribution', e.image_attribution,
            'sources', e.sources
          )
        )
        from events e
        where e.timeline_id = t.id
      ),
      '[]'::jsonb
    )
  )
  from timelines t
  where t.id = p_timeline_id
    and t.is_public;
$$;

revoke all on function get_public_timeline(uuid) from public;
grant execute on function get_public_timeline(uuid) to anon, authenticated;
