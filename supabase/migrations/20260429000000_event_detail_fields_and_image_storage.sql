/*
  # Add event detail fields and storage bucket for event images

  1. Schema changes
    - Add `description` (TEXT, nullable) to `events`
    - Add `image_url` (TEXT, nullable) to `events`
    - Add `sources` (JSONB, defaults to '[]') to `events`

  2. Storage
    - Create public-read bucket `event-images`
    - Public can read any image
    - Authenticated users can INSERT/DELETE images under their own
      `{auth.uid}/...` prefix
*/

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read access for event images" ON storage.objects;
CREATE POLICY "Public read access for event images"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');

DROP POLICY IF EXISTS "Authenticated users can upload event images" ON storage.objects;
CREATE POLICY "Authenticated users can upload event images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authenticated users can delete own event images" ON storage.objects;
CREATE POLICY "Authenticated users can delete own event images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
