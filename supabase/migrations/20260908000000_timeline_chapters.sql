/*
  # Timeline chapters

  Chapters are named, contiguous spans of a timeline — "Sputnik Shock",
  "Race to the Moon" — generated alongside the events by the AI pass and shown
  as a strip of chips above the canvas, so a reader can see where in the
  timeline they currently are.

  Stored as a jsonb column on `timelines`, following `categories` rather than
  the vestigial `timeline_categories` table: the child-table shape was tried
  for a named grouping once already, was never written by anything, and its
  empty result then wiped the editor's state on every load (see
  `src/hooks/useTimeline.ts`). One column, read and written by the same paths
  that already carry `categories`.

  Three places change together:

  1. the column itself,
  2. `get_public_timeline`, which hand-builds its payload column by column and
     would otherwise leave /view/:id blind to chapters,
  3. the `timelines_set_updated_at` WHEN clause, which enumerates the columns
     an edit can touch — without chapters listed, a save that changed only
     chapters would be mistaken for a share-only update and skip the stamp.

  Idempotent, like every migration here: they are applied by hand and nothing
  verifies that they were.
*/

alter table timelines add column if not exists chapters jsonb;

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
      'group_by_category', t.group_by_category
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

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
--
-- Recreated verbatim from 20260808000000_timeline_ordering.sql with `chapters`
-- added to the carve-out. The clause still says the same thing: stamp on every
-- update EXCEPT one whose only change is `is_public`.

drop trigger if exists timelines_set_updated_at on timelines;

create trigger timelines_set_updated_at
  before update on timelines
  for each row
  when (
    not (
      old.is_public is distinct from new.is_public
      and old.title is not distinct from new.title
      and old.description is not distinct from new.description
      and old.categories is not distinct from new.categories
      and old.chapters is not distinct from new.chapters
      and old.scale is not distinct from new.scale
      and old.vertical_scale is not distinct from new.vertical_scale
      and old.group_by_category is not distinct from new.group_by_category
    )
  )
  execute function set_timelines_updated_at();
