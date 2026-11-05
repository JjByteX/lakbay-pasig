-- Seasonality labels (docs/seasonal-visits-plan.md, Phase 2).
--
-- place_seasonality holds one row per place or business that has a label to
-- show: the calendar months it is busiest in, e.g. {11,12}. A place with no
-- row shows nothing. refresh_place_seasonality() rebuilds the whole table from
-- place_visits (0004). The nightly job calls it (.github/workflows/seasonality.yml).
--
-- The rule, all constants at the top of the function:
--   1. Window: the last 12 complete calendar months in Manila time, so each
--      month of the year is counted exactly once.
--   2. Hidden unless the app has 12 months of history (first visit at least a
--      year old) and the place has 30 or more visits in the window.
--   3. For each month: the place's visits that month, against the visits it
--      would have had if it kept its usual share of the whole app's visits that
--      month. Dividing by the app's total stops app growth from making every
--      place look busiest in recent months.
--   4. Small counts shrink toward "normal": K pretend visits are added to both
--      sides before dividing, so a low-volume place does not get a wild label.
--   5. A month at 1.5x or more of normal is a peak.
-- No user id is read or stored anywhere in this.

create table if not exists public.place_seasonality (
  kind text not null check (kind in ('place', 'business')),
  item_id uuid not null,
  peak_months smallint[] not null,
  updated_at timestamptz not null default now(),
  primary key (kind, item_id)
);

-- Labels are public, but only for a place or business the visitor can already
-- see (same visibility as places_select_public and businesses_select_public).
-- Nobody writes through the API: only the function below does.
alter table public.place_seasonality enable row level security;

create policy "place_seasonality_select_visible"
  on public.place_seasonality for select
  using (
    (kind = 'place' and exists (
      select 1 from public.places p
      where p.id = item_id and p.verification_status = 'verified'))
    or
    (kind = 'business' and exists (
      select 1 from public.businesses b
      where b.id = item_id and b.verification_status in ('verified', 'pending')))
  );

create or replace function public.refresh_place_seasonality()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  min_visits constant integer := 30;
  peak_ratio constant numeric := 1.5;
  shrink_k constant numeric := 3;
  first_visit timestamptz;
  win_end timestamp := date_trunc('month', now() at time zone 'Asia/Manila');
  inserted integer;
begin
  select min(visited_at) into first_visit from public.place_visits;

  -- Cold start: under a year of history, no label anywhere.
  if first_visit is null or first_visit > now() - interval '12 months' then
    delete from public.place_seasonality where true;
    return 0;
  end if;

  delete from public.place_seasonality where true;

  with v as (
    select kind, item_id,
           extract(month from visited_at at time zone 'Asia/Manila')::int as m
    from public.place_visits
    where visited_at at time zone 'Asia/Manila' >= win_end - interval '12 months'
      and visited_at at time zone 'Asia/Manila' < win_end
  ),
  app as (select m, count(*)::numeric as total from v group by m),
  app_all as (select sum(total) as total from app),
  per_month as (select kind, item_id, m, count(*)::numeric as c from v group by kind, item_id, m),
  item as (
    select kind, item_id, sum(c) as n
    from per_month group by kind, item_id
    having sum(c) >= min_visits
  ),
  ratio as (
    select i.kind, i.item_id, mo.m,
           (coalesce(pm.c, 0) + shrink_k)
             / (i.n * coalesce(a.total, 0) / aa.total + shrink_k) as r
    from item i
    cross join generate_series(1, 12) as mo(m)
    cross join app_all aa
    left join app a on a.m = mo.m
    left join per_month pm
      on pm.kind = i.kind and pm.item_id = i.item_id and pm.m = mo.m
  )
  insert into public.place_seasonality (kind, item_id, peak_months)
  select kind, item_id, array_agg(m::smallint order by m)
  from ratio
  where r >= peak_ratio
  group by kind, item_id;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Only the nightly job (service role) may run it.
revoke execute on function public.refresh_place_seasonality() from public, anon, authenticated;
grant execute on function public.refresh_place_seasonality() to service_role;
