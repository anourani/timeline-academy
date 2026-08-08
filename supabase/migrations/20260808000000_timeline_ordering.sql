/*
  # Side-panel ordering: server-stamped updated_at, and realtime on timelines

  Two independent pieces, both supporting the "most recently edited first"
  order of the side panel's timeline list.

  ## NOTHING IN THE APP DEPENDS ON THIS MIGRATION.

  Stated first because this repo has been burned by the opposite assumption.
  Migrations here are pasted into the Supabase SQL editor by hand and nothing
  verifies that it happened, so the client was written to be correct whether or
  not this file has ever been applied:

    - The client still sends `updated_at` on every autosave. Part 1 below
      overwrites it with the server clock where it exists; where it doesn't,
      the client value lands and the order is still right.
    - Live re-ordering runs off a same-tab event dispatched by the write layer
      (`src/utils/timelineSaved.ts`), not off realtime. Part 2 below only buys
      cross-tab and cross-device updates.

  Verify what is actually live rather than trusting this file:

    -- Part 1 applied?
    select tgname from pg_trigger
    where tgrelid = 'public.timelines'::regclass and not tgisinternal;

    -- Part 2 applied?
    select * from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'timelines';

  Both parts are idempotent and safe to re-run.
*/

-- ---------------------------------------------------------------------------
-- Part 1: stamp updated_at from the server clock
-- ---------------------------------------------------------------------------
--
-- `updated_at` is the side panel's sort key, and until now the only thing that
-- ever wrote it was the browser (`useAutosave`), while INSERTs took the column
-- default `now()` from the server. A client whose clock runs behind could
-- therefore edit a timeline and watch it sort *below* one that had merely been
-- created, or below rows edited from another device.

create or replace function set_timelines_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists timelines_set_updated_at on timelines;

-- The WHEN clause carves out one case: an update whose ONLY change is
-- `is_public`. Sharing and unsharing (the tile menu, and the nav's Share
-- button) deliberately leave `updated_at` alone, because sharing a timeline is
-- not editing it and must not move its tile. A blanket BEFORE UPDATE trigger
-- would quietly reverse that.
--
-- Everything else — including an autosave that only changed events, which
-- rewrites the row's columns to identical values — still stamps, so any real
-- edit moves the timeline to the top.
create trigger timelines_set_updated_at
  before update on timelines
  for each row
  when (
    not (
      old.is_public is distinct from new.is_public
      and old.title is not distinct from new.title
      and old.description is not distinct from new.description
      and old.categories is not distinct from new.categories
      and old.scale is not distinct from new.scale
      and old.vertical_scale is not distinct from new.vertical_scale
      and old.group_by_category is not distinct from new.group_by_category
    )
  )
  execute function set_timelines_updated_at();

-- ---------------------------------------------------------------------------
-- Part 2: put timelines in the realtime publication
-- ---------------------------------------------------------------------------
--
-- `useTimelines` has always subscribed to postgres_changes on this table, but
-- no migration ever added it to the publication — it existed, if at all, only
-- as dashboard state that nothing in the repo recorded or checked. This makes
-- the dependency visible and reproducible on a fresh project.
--
-- Note what this still does NOT fix: the realtime DELETE branch in
-- `useTimelines` reads `payload.old.id` under a `user_id=eq.` filter, and under
-- default replica identity a DELETE's `old` carries only the primary key, so
-- that filter can never match. Deletes are handled explicitly instead, by the
-- `refreshTimelines()` / `loadTimelines()` calls at the delete sites. Fixing it
-- properly would need `replica identity full`, which is a much larger ask.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'timelines'
  ) then
    alter publication supabase_realtime add table public.timelines;
  end if;
exception
  when undefined_object then
    -- No supabase_realtime publication on this database. Not fatal: realtime
    -- is a bonus here, not a dependency.
    raise notice 'supabase_realtime publication not found; skipping';
end $$;
