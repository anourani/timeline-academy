/*
  # Add group_by_category column to timelines table

  1. Changes
    - Add `group_by_category` boolean column to `timelines` table with default false
    - Idempotent: only adds the column if it does not already exist
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timelines'
    AND column_name = 'group_by_category'
  ) THEN
    ALTER TABLE timelines
    ADD COLUMN group_by_category boolean NOT NULL DEFAULT false;
  END IF;
END $$;
