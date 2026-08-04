/*
  # Explicit public sharing

  The Share feature hands out /view/:id links, but no policy has ever allowed
  non-owners to read a timeline. This makes sharing an explicit, revocable
  state instead of relying on out-of-band policy changes:

  1. `timelines.is_public` — off by default; flipped on by the owner when they
     share, off when they unshare. Existing timelines stay private; previously
     copied links only work again once their owner re-shares.

  2. `get_public_timeline(uuid)` — a SECURITY DEFINER function that returns a
     shared timeline and its events as one JSON payload. Public reads go
     through this function instead of anon SELECT policies on the tables, so:
     - visitors must hold the timeline's UUID (no way to list public rows),
     - `user_id` and other non-display columns are never exposed,
     - RLS on the underlying tables stays owner-only.
*/

alter table timelines add column if not exists is_public boolean not null default false;

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
