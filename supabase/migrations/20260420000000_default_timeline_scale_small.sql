/*
  # Change default timeline scale to 'small'

  1. Changes
    - Update the default value of the `scale` column on `timelines` from 'large' to 'small'
    - Existing rows are not modified; only new inserts without an explicit `scale` are affected
*/

ALTER TABLE timelines ALTER COLUMN scale SET DEFAULT 'small';
