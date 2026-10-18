/*
  # Timeline provenance: was it AI-generated?

  AI timelines are built from a prompt, so the editor hides the hand-entry
  controls on them (Add Event, Add Category, delete category) and moves the
  category legend into the dock. That needs to know where a timeline came
  from, which nothing recorded until now.

  The client writes this column with its own best-effort update, never as part
  of the insert or autosave's update (`markTimelineAiGenerated` in
  `src/hooks/useTimeline.ts`). That keeps every save working in the window
  where the site has shipped but this migration has not been applied yet —
  until it is, the client falls back to "has chapters", the same rule the
  backfill below uses.

  Not added to `get_public_timeline`: /view/:id has no dock and no editing.

  Idempotent, like every migration here: they are applied by hand and nothing
  verifies that they were.
*/

alter table timelines add column if not exists is_ai_generated boolean not null default false;

-- Backfill. Only an AI generation produces chapters, so a timeline with
-- chapters was AI-generated. AI timelines from before chapters existed can't
-- be told apart from hand-built ones and stay false.
--
-- The updated_at trigger is held off for the backfill: the side panel orders
-- on updated_at, and stamping every AI timeline with the migration's time
-- would reshuffle every user's list.
alter table timelines disable trigger timelines_set_updated_at;

update timelines
set is_ai_generated = true
where is_ai_generated = false
  and chapters is not null
  and jsonb_typeof(chapters) = 'array'
  and jsonb_array_length(chapters) > 0;

alter table timelines enable trigger timelines_set_updated_at;
