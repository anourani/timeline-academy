/*
  # Add scale column to timelines table

  1. Changes
    - Add `scale` column to `timelines` table with default value 'large'
    - Add check constraint to ensure valid scale values
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'timelines' 
    AND column_name = 'scale'
  ) THEN
    ALTER TABLE timelines 
    ADD COLUMN scale text NOT NULL DEFAULT 'large'
    CHECK (scale IN ('large', 'small'));
  END IF;
END $$;