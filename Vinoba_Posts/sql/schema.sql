-- ============================================================
--  Vinoba Posts  ·  database setup
--  Run this ONCE in Supabase:  Dashboard -> SQL Editor -> paste -> Run
-- ============================================================

create table if not exists public.teacher_posts (
  post_id               bigint primary key,          -- from "PostId" (dedup key)
  post_created_at       timestamptz,                 -- parsed from "post_created_date"
  post_created_date_raw text,                         -- original value, untouched
  community_name        text,
  district_name         text,
  block_name            text,
  circle_name           text,
  school_name           text,
  full_name             text,
  mobile_number         text,
  email                 text,
  link_url              text,                         -- from "LinkURL"
  score                 numeric,                      -- from "Score"
  category_name         text,
  subject_name          text,
  tags                  text,
  do_not_consider       text,                         -- from "DO NOT CONSIDER"
  class_value           text,                         -- from "CLASS"
  period_start          date,                         -- the Start Date you enter on upload
  period_end            date,                         -- the End Date you enter on upload
  uploaded_at           timestamptz not null default now()
);

-- Indexes for the dashboard's filters
create index if not exists idx_tp_created_at on public.teacher_posts (post_created_at);
create index if not exists idx_tp_period     on public.teacher_posts (period_start, period_end);
create index if not exists idx_tp_district   on public.teacher_posts (district_name);
create index if not exists idx_tp_subject    on public.teacher_posts (subject_name);

-- ------------------------------------------------------------
--  Row Level Security
--  The anon (public) key can READ and INSERT, but NOT update or
--  delete. So the worst a stranger with your key could do is add
--  rows -- they can never change or wipe your history, and the
--  post_id primary key blocks duplicates at the database level.
--  Lock this down with Supabase Auth before it holds real data.
-- ------------------------------------------------------------
alter table public.teacher_posts enable row level security;

grant select, insert on public.teacher_posts to anon;

drop policy if exists "anon can read"   on public.teacher_posts;
drop policy if exists "anon can insert" on public.teacher_posts;

create policy "anon can read"
  on public.teacher_posts for select to anon using (true);

create policy "anon can insert"
  on public.teacher_posts for insert to anon with check (true);
