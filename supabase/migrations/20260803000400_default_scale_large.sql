/*
  # Default new timelines to the 'large' scale

  20260502000000 left the column default at 'medium'. The app's own defaults
  (useTimelineScale, draftStorage, and the read-time fallbacks) now start new
  timelines at 'large', so the column default is brought in line for the one
  insert path that omits scale entirely (useTimeline.ts createTimeline).

  Existing timelines keep whatever scale their owner chose.
*/

alter table timelines alter column scale set default 'large';
