/*
  # Rename existing 'small' scale to 'medium' and introduce a new 'small' scale

  1. Drop the existing CHECK constraint on `timelines.scale`
  2. UPDATE all rows where scale = 'small' to scale = 'medium'
  3. Add new CHECK constraint allowing ('large', 'medium', 'small')
  4. Update default value to 'medium'

  All steps run in a single transaction so a failure rolls everything back.
*/

BEGIN;

-- 1. Drop the existing CHECK constraint.
--    The original constraint was created inline via ADD COLUMN ... CHECK (...) so
--    Postgres auto-named it. Verify the actual name with:
--      SELECT conname FROM pg_constraint
--      WHERE conrelid = 'timelines'::regclass AND contype = 'c';
--    Common auto-name is `timelines_scale_check`. Adjust below if different.
ALTER TABLE timelines DROP CONSTRAINT IF EXISTS timelines_scale_check;

-- 2. Migrate existing 'small' rows to 'medium'.
--    Today's 'small' (20px) becomes tomorrow's 'medium' (same 20px).
UPDATE timelines SET scale = 'medium' WHERE scale = 'small';

-- 3. Add new CHECK constraint with all three allowed values.
ALTER TABLE timelines
  ADD CONSTRAINT timelines_scale_check
  CHECK (scale IN ('large', 'medium', 'small'));

-- 4. Set new default for inserts that omit the scale column.
ALTER TABLE timelines ALTER COLUMN scale SET DEFAULT 'medium';

COMMIT;
