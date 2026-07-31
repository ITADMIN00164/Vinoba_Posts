-- ============================================================
--  Vinoba Posts · dashboard functions
--  Run this in Supabase SQL Editor AFTER schema.sql (run once).
-- ============================================================

-- 1) Earliest and latest post date in the database
create or replace function public.dashboard_date_range()
returns table(min_date date, max_date date) language sql stable as $$
  select min(post_created_at at time zone 'UTC')::date,
         max(post_created_at at time zone 'UTC')::date
  from public.teacher_posts
  where post_created_at is not null;
$$;

-- 2) Distinct values for the Community / Category / Subject / Month filters
create or replace function public.dashboard_options()
returns json language sql stable as $$
  select json_build_object(
    'communities', (select coalesce(json_agg(v order by v), '[]'::json)
                    from (select distinct community_name v from public.teacher_posts
                          where community_name is not null) a),
    'categories',  (select coalesce(json_agg(v order by v), '[]'::json)
                    from (select distinct category_name v from public.teacher_posts
                          where category_name is not null) b),
    'subjects',    (select coalesce(json_agg(v order by v), '[]'::json)
                    from (select distinct subject_name v from public.teacher_posts
                          where subject_name is not null) c),
    'months',      (select coalesce(json_agg(v order by v), '[]'::json)
                    from (select distinct to_char(post_created_at at time zone 'UTC','YYYY-MM') v
                          from public.teacher_posts where post_created_at is not null) d)
  );
$$;

-- 2) Districts, dependent on the chosen community/state
create or replace function public.dashboard_districts(p_communities text[] default null)
returns table(district text) language sql stable as $$
  select distinct district_name
  from public.teacher_posts
  where district_name is not null
    and (coalesce(cardinality(p_communities),0) = 0 or community_name = any(p_communities))
  order by district_name;
$$;

-- 2b) Subjects, dependent on the chosen community / district / category
create or replace function public.dashboard_subjects(
  p_communities text[] default null,
  p_districts   text[] default null,
  p_categories  text[] default null
)
returns table(subject text) language sql stable as $$
  select distinct subject_name
  from public.teacher_posts
  where subject_name is not null
    and (coalesce(cardinality(p_communities),0) = 0 or community_name = any(p_communities))
    and (coalesce(cardinality(p_districts),0)   = 0 or district_name  = any(p_districts))
    and (coalesce(cardinality(p_categories),0)  = 0 or category_name  = any(p_categories))
  order by subject_name;
$$;

-- 3) The weekly table data
--    week_no 1..5  = weeks of the month (days 1-7, 8-14, 15-21, 22-28, 29+)
--    week_no 0     = whole-month total (uniques counted correctly across the month)
create or replace function public.dashboard_weekly(
  p_communities text[]  default null,
  p_districts   text[]  default null,
  p_categories  text[]  default null,
  p_subjects    text[]  default null,
  p_months      text[]  default null,
  p_include_dnc boolean default false
)
returns table(
  month_key       text,
  week_no         int,
  unique_schools  bigint,
  unique_teachers bigint,
  total_posts     bigint
)
language sql stable as $$
  with f as (
    select
      to_char(post_created_at at time zone 'UTC','YYYY-MM') as month_key,
      ((extract(day from post_created_at at time zone 'UTC')::int - 1) / 7) + 1 as week_no,
      school_name,
      coalesce(nullif(mobile_number,''), full_name) as teacher_key
    from public.teacher_posts
    where post_created_at is not null
      and (p_include_dnc or do_not_consider is null or lower(do_not_consider) <> 'true')
      and (coalesce(cardinality(p_communities),0) = 0 or community_name = any(p_communities))
      and (coalesce(cardinality(p_districts),0)   = 0 or district_name  = any(p_districts))
      and (coalesce(cardinality(p_categories),0)  = 0 or category_name  = any(p_categories))
      and (coalesce(cardinality(p_subjects),0)    = 0 or subject_name   = any(p_subjects))
      and (coalesce(cardinality(p_months),0)      = 0
           or to_char(post_created_at at time zone 'UTC','YYYY-MM') = any(p_months))
  )
  select month_key, week_no,
         count(distinct school_name)::bigint,
         count(distinct teacher_key)::bigint,
         count(*)::bigint
  from f group by month_key, week_no
  union all
  select month_key, 0,
         count(distinct school_name)::bigint,
         count(distinct teacher_key)::bigint,
         count(*)::bigint
  from f group by month_key
  order by 1, 2;
$$;

-- Let the public anon key call these read-only functions
grant execute on function public.dashboard_date_range()              to anon;
grant execute on function public.dashboard_options()                 to anon;
grant execute on function public.dashboard_districts(text[])          to anon;
grant execute on function public.dashboard_subjects(text[],text[],text[]) to anon;
grant execute on function public.dashboard_weekly(text[],text[],text[],text[],text[],boolean) to anon;
