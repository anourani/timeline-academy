/*
  # Create Timeline and Events Tables

  1. New Tables
    - `timelines`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `title` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `events`
      - `id` (uuid, primary key) 
      - `timeline_id` (uuid, references timelines)
      - `title` (text)
      - `start_date` (date)
      - `end_date` (date)
      - `category` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
    - Add timeline limit check function
*/

-- Create tables
create table timelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid references timelines(id) on delete cascade not null,
  title text not null,
  start_date date not null,
  end_date date not null,
  category text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table timelines enable row level security;
alter table events enable row level security;

-- Create timeline limit check function
create or replace function check_timeline_limit() 
returns trigger as $$
begin
  if (select count(*) from timelines where user_id = auth.uid()) >= 3 then
    raise exception 'Maximum limit of 3 timelines reached';
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Create timeline limit trigger
create trigger enforce_timeline_limit
  before insert on timelines
  for each row
  execute function check_timeline_limit();

-- RLS Policies
create policy "Users can create their own timelines"
  on timelines for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own timelines"
  on timelines for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update their own timelines"
  on timelines for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own timelines"
  on timelines for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create events in their timelines"
  on events for insert
  to authenticated
  with check (
    exists (
      select 1 from timelines 
      where id = timeline_id 
      and user_id = auth.uid()
    )
  );

create policy "Users can view events in their timelines"
  on events for select
  to authenticated
  using (
    exists (
      select 1 from timelines 
      where id = timeline_id 
      and user_id = auth.uid()
    )
  );

create policy "Users can update events in their timelines"
  on events for update
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

create policy "Users can delete events in their timelines"
  on events for delete
  to authenticated
  using (
    exists (
      select 1 from timelines 
      where id = timeline_id 
      and user_id = auth.uid()
    )
  );