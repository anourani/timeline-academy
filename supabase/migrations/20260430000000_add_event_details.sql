-- Add nullable columns to events for AI-generated detail panel content.
-- All four are populated only when a user opens "Open details" on an event;
-- existing rows remain valid with NULL values.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'description') THEN
    ALTER TABLE events ADD COLUMN description text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'image_url') THEN
    ALTER TABLE events ADD COLUMN image_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'image_attribution') THEN
    ALTER TABLE events ADD COLUMN image_attribution text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'sources') THEN
    ALTER TABLE events ADD COLUMN sources jsonb;
  END IF;
END $$;
