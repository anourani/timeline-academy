/*
  # Timeline origin (provenance)

  Records where a timeline's events came from, so an AI-generated timeline
  cannot be quietly hand-edited and then still presented as raw model output.

    'manual'  hand-built, imported from CSV/Excel, or created before this
              column existed — we have no record for those, and 'manual' is
              the honest default rather than locking work someone has been
              editing for months
    'ai'      produced by a generation run and untouched since; the editor
              locks event add/edit/delete while a timeline is in this state
    'edited'  was 'ai', and the user chose to unlock it

  The transition is deliberately one-way. Unlocking spends the 'ai' label for
  good; there is no path back, because a timeline that has been edited can
  never truthfully claim to be unedited again.

  This is a product-integrity signal, NOT a security control, and the check
  constraint is the only enforcement here. The owner of a row can still write
  to it directly through PostgREST — RLS grants them exactly that — so nothing
  in this migration stops a determined user from setting origin back to 'ai'
  by hand. Making it tamper-proof would need a trigger that rejects or
  downgrades event writes against an 'ai' timeline; that was considered and
  deliberately deferred.

  Idempotent, like every migration here: they are applied by hand and nothing
  verifies that they were.
*/

alter table timelines
  add column if not exists origin text not null default 'manual';

-- Separate from the ADD COLUMN so re-running against a database that already
-- has the column still installs the constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'timelines_origin_check'
  ) then
    alter table timelines
      add constraint timelines_origin_check
      check (origin in ('manual', 'ai', 'edited'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Public read path
-- ---------------------------------------------------------------------------
--
-- Recreated from 20260908000000_timeline_chapters.sql with `origin` added.
-- The shared view is where provenance matters most: the person you send a
-- link to is precisely the person a doctored timeline would mislead.

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
      'origin', t.origin,
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
-- Deliberately NOT changed. `origin` is absent from the is_public carve-out,
-- so an unlock stamps updated_at and moves the timeline's tile — which is
-- correct: unlocking is a deliberate act on that timeline by its owner, and
-- it is immediately followed by the edits it exists to permit.
