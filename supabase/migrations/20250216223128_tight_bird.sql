/*
  # Add categories column to timelines table

  1. Changes
    - Add JSONB categories column to timelines table
    - Add check constraint for valid category format
    - Ensure idempotent execution
*/

-- Add categories column
ALTER TABLE timelines 
ADD COLUMN IF NOT EXISTS categories JSONB;

-- Add check constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'valid_categories_format'
  ) THEN
    ALTER TABLE timelines
    ADD CONSTRAINT valid_categories_format 
    CHECK (
      categories IS NULL OR 
      jsonb_typeof(categories) = 'array'
    );
  END IF;
END $$;