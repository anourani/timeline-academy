/*
  # Add Timeline Categories Table

  1. New Tables
    - `timeline_categories`
      - `id` (uuid, primary key)
      - `timeline_id` (uuid, references timelines)
      - `category_id` (text)
      - `label` (text)
      - `color` (text)
      - `order` (integer)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `timeline_categories` table
    - Add policies for authenticated users to manage their timeline categories
*/

-- Create timeline categories table
create table timeline_categories (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid references timelines(id) on delete cascade not null,
  category_id text not null,
  label text not null,
  color text not null,
  "order" integer not null default 0,
  created_at timestamptz default now()
);

-- Enable RLS
alter table timeline_categories enable row level security;

-- RLS Policies
create policy "Users can create categories for their timelines"
  on timeline_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from timelines 
      where id = timeline_id 
      and user_id = auth.uid()
    )
  );

create policy "Users can view categories for their timelines"
  on timeline_categories for select
  to authenticated
  using (
    exists (
      select 1 from timelines 
      where id = timeline_id 
      and user_id = auth.uid()
    )
  );

create policy "Users can update categories for their timelines"
  on timeline_categories for update
  to authenticated
  using (
    exists (
      select 1 from timelines 
      where id = timeline_id 
      and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from timelines 
      where id = timeline_id 
      and user_id = auth.uid()
    )
  );

create policy "Users can delete categories for their timelines"
  on timeline_categories for delete
  to authenticated
  using (
    exists (
      select 1 from timelines 
      where id = timeline_id 
      and user_id = auth.uid()
    )
  );

-- Add description column to timelines table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'timelines' 
    AND column_name = 'description'
  ) THEN
    ALTER TABLE timelines ADD COLUMN description text;
  END IF;
END $$;