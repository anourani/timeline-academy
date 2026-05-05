/*
  # Add vertical_scale column to timelines table

  1. Changes
    - Add `vertical_scale` text column to `timelines` with default 'small'
    - CHECK constraint allowing ('small', 'medium')
    - Idempotent: only adds the column if it does not already exist

  Default 'small' preserves the current visual behavior for every existing
  timeline (event row height stays at 36/38px).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timelines'
    AND column_name = 'vertical_scale'
  ) THEN
    ALTER TABLE timelines
    ADD COLUMN vertical_scale text NOT NULL DEFAULT 'small'
    CHECK (vertical_scale IN ('small', 'medium'));
  END IF;
END $$;
