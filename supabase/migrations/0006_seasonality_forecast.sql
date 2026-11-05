-- Seasonality, Phase 3 (docs/seasonal-visits-plan.md): averaging across years,
-- weekly peaks, crowd hints, next-week expectation and the Tourism Office
-- planning view. 0005 is not edited. This replaces refresh_place_seasonality()
-- and widens place_seasonality. The visit log (0004) does not change.
--
-- What changes in the calculation, all plain SQL:
--   1. Window: up to 3 complete years (whole years of history, at most 3), so
--      one unusual year no longer defines a season. Visits from all years are
--      pooled before comparing with the place's usual share of app traffic.
--   2. A month or week counts as a peak only if it was also above normal in
--      more than half of the years in the window. One event in one year is not
--      a season. With a single year of history there is nothing to compare.
--   3. Weekly peaks: 52 fixed buckets (day 1 to 7 of the year, and so on; the
--      last one takes the leftover days). A week needs 2.0x normal, since a
--      week holds far fewer visits than a month. This is what separates Undas
--      (Nov 1 to 2) from the rest of November.
--   4. Crowd hints: six slots (weekday or weekend, morning, afternoon or
--      evening, Manila time). 1.5x normal is "usually busier", 0.5x or less is
--      "usually quieter".
--   5. busier_next_week: the week bucket seven days from now is a peak week.
-- Same threshold as before: 30 visits in the last 12 months, and 12 months of
-- app history. Same shrinking: 3 pretend visits on both sides of every ratio.
-- No user id is read or stored. Prophet or STL is not used: they need a Python
-- job and a long series per place, and pooled shares with the consistency
-- check above do the same job here.

alter table public.place_seasonality
  add column if not exists peak_weeks smallint[] not null default '{}',
  add column if not exists busy_slots text[] not null default '{}',
  add column if not exists quiet_slots text[] not null default '{}',
  add column if not exists busier_next_week boolean not null default false;

create or replace function public.refresh_place_seasonality()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  min_visits constant integer := 30;
  peak_ratio constant numeric := 1.5;
  week_peak_ratio constant numeric := 2.0;
  quiet_ratio constant numeric := 0.5;
  shrink_k constant numeric := 3;
  max_years constant integer := 3;
  v_first timestamptz;
  v_years integer;
  v_win_end timestamp := date_trunc('month', now() at time zone 'Asia/Manila');
  v_win_start timestamp;
  v_next_wk integer :=
    least(52, (extract(doy from ((now() at time zone 'Asia/Manila')::date + 7))::int - 1) / 7 + 1);
  v_inserted integer;
begin
  select min(visited_at) into v_first from public.place_visits;

  delete from public.place_seasonality where true;

  -- Cold start: under a year of history, no label anywhere.
  if v_first is null or v_first > now() - interval '12 months' then
    return 0;
  end if;

  v_years := least(max_years, floor(extract(epoch from (now() - v_first)) / (365.25 * 86400))::int);
  v_win_start := v_win_end - make_interval(years => v_years);

  with v as (
    select kind, item_id,
           extract(month from l)::int as m,
           least(52, (extract(doy from l)::int - 1) / 7 + 1) as wk,
           (case when extract(isodow from l) >= 6 then 'weekend' else 'weekday' end)
             || '_' ||
             (case when extract(hour from l) < 12 then 'morning'
                   when extract(hour from l) < 17 then 'afternoon'
                   else 'evening' end) as slot,
           ((extract(year from l)::int * 12 + extract(month from l)::int)
             - (extract(year from v_win_start)::int * 12 + extract(month from v_win_start)::int)) / 12 as yr,
           l >= v_win_end - interval '12 months' as recent
    from (
      select kind, item_id, visited_at at time zone 'Asia/Manila' as l
      from public.place_visits
    ) p
    where l >= v_win_start and l < v_win_end
  ),
  item as (
    select kind, item_id, count(*)::numeric as n
    from v
    group by kind, item_id
    having count(*) >= min_visits and count(*) filter (where recent) >= min_visits
  ),
  buck as (
    select kind, item_id, yr, 'm'::text as dim, m::text as b from v
    union all select kind, item_id, yr, 'w', wk::text from v
    union all select kind, item_id, yr, 's', slot from v
  ),
  app_all as (select count(*)::numeric as total from v),
  app_b as (select dim, b, count(*)::numeric as total from buck group by dim, b),
  app_by as (select dim, b, yr, count(*)::numeric as total from buck group by dim, b, yr),
  app_y as (select yr, count(*)::numeric as total from v group by yr),
  item_b as (
    select k.kind, k.item_id, k.dim, k.b, count(*)::numeric as c
    from buck k join item i on i.kind = k.kind and i.item_id = k.item_id
    group by k.kind, k.item_id, k.dim, k.b
  ),
  item_by as (
    select k.kind, k.item_id, k.dim, k.b, k.yr, count(*)::numeric as c
    from buck k join item i on i.kind = k.kind and i.item_id = k.item_id
    group by k.kind, k.item_id, k.dim, k.b, k.yr
  ),
  item_y as (
    select x.kind, x.item_id, x.yr, count(*)::numeric as n
    from v x join item i on i.kind = x.kind and i.item_id = x.item_id
    group by x.kind, x.item_id, x.yr
  ),
  domain as (
    select 'm'::text as dim, g::text as b from generate_series(1, 12) g
    union all select 'w', g::text from generate_series(1, 52) g
    union all select 's', s from (values
      ('weekday_morning'), ('weekday_afternoon'), ('weekday_evening'),
      ('weekend_morning'), ('weekend_afternoon'), ('weekend_evening')) t(s)
  ),
  -- Pooled over the whole window: the place's visits in a bucket against what
  -- it would have had at its usual share of the app's visits in that bucket.
  ratio as (
    select i.kind, i.item_id, d.dim, d.b,
           (coalesce(ib.c, 0) + shrink_k)
             / (i.n * coalesce(ab.total, 0) / aa.total + shrink_k) as r
    from item i
    cross join domain d
    cross join app_all aa
    left join app_b ab on ab.dim = d.dim and ab.b = d.b
    left join item_b ib
      on ib.kind = i.kind and ib.item_id = i.item_id and ib.dim = d.dim and ib.b = d.b
  ),
  -- The same ratio inside each single year, for months and weeks only.
  yratio as (
    select i.kind, i.item_id, d.dim, d.b, y.yr,
           (coalesce(iby.c, 0) + shrink_k)
             / (coalesce(iy.n, 0) * coalesce(aby.total, 0) / ay.total + shrink_k) as r
    from item i
    cross join (select * from domain where dim in ('m', 'w')) d
    cross join generate_series(0, v_years - 1) as y(yr)
    left join app_y ay on ay.yr = y.yr
    left join app_by aby on aby.dim = d.dim and aby.b = d.b and aby.yr = y.yr
    left join item_by iby
      on iby.kind = i.kind and iby.item_id = i.item_id and iby.dim = d.dim and iby.b = d.b and iby.yr = y.yr
    left join item_y iy on iy.kind = i.kind and iy.item_id = i.item_id and iy.yr = y.yr
  ),
  consistent as (
    select kind, item_id, dim, b,
           (v_years < 2 or (count(*) filter (where r > 1)) * 2 > v_years) as ok
    from yratio
    group by kind, item_id, dim, b
  ),
  flags as (
    select r.kind, r.item_id, r.dim, r.b, r.r, coalesce(c.ok, true) as ok
    from ratio r
    left join consistent c
      on c.kind = r.kind and c.item_id = r.item_id and c.dim = r.dim and c.b = r.b
  ),
  packed as (
    select kind, item_id,
           coalesce(array_agg((case when dim = 'm' then b::smallint end) order by (case when dim = 'm' then b::int end))
             filter (where dim = 'm' and r >= peak_ratio and ok), '{}'::smallint[]) as peak_months,
           coalesce(array_agg((case when dim = 'w' then b::smallint end) order by (case when dim = 'w' then b::int end))
             filter (where dim = 'w' and r >= week_peak_ratio and ok), '{}'::smallint[]) as peak_weeks,
           coalesce(array_agg(b order by b)
             filter (where dim = 's' and r >= peak_ratio), '{}'::text[]) as busy_slots,
           coalesce(array_agg(b order by b)
             filter (where dim = 's' and r <= quiet_ratio), '{}'::text[]) as quiet_slots,
           coalesce(bool_or(dim = 'w' and b = v_next_wk::text and r >= week_peak_ratio and ok), false)
             as busier_next_week
    from flags
    group by kind, item_id
  )
  insert into public.place_seasonality
    (kind, item_id, peak_months, peak_weeks, busy_slots, quiet_slots, busier_next_week)
  select kind, item_id, peak_months, peak_weeks, busy_slots, quiet_slots, busier_next_week
  from packed
  where cardinality(peak_months) + cardinality(peak_weeks)
        + cardinality(busy_slots) + cardinality(quiet_slots) > 0
     or busier_next_week;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Tourism Office planning view: counts for the last 12 complete months, one row
-- per place or business at or over the same threshold, none while the app is
-- under 12 months old. Counts only, never a user. Same permission as the other
-- report functions (admin, or view_reports).
create or replace function public.report_visit_planning()
returns table (
  kind text,
  item_id uuid,
  name text,
  visits_12m integer,
  monthly integer[],
  peak_months smallint[],
  peak_weeks smallint[],
  busier_next_week boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with allowed as (
    select exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.active_status = 'active'
        and (pr.staff_role = 'admin' or 'view_reports' = any(pr.system_permission))
    ) as ok
  ),
  hist as (select min(visited_at) as t from public.place_visits),
  win as (select date_trunc('month', now() at time zone 'Asia/Manila') as e),
  v as (
    select pv.kind, pv.item_id,
           extract(month from pv.visited_at at time zone 'Asia/Manila')::int as m
    from public.place_visits pv, win
    where pv.visited_at at time zone 'Asia/Manila' >= win.e - interval '12 months'
      and pv.visited_at at time zone 'Asia/Manila' < win.e
  ),
  per as (
    select kind, item_id, count(*)::integer as n,
           array[
             (count(*) filter (where m = 1))::integer, (count(*) filter (where m = 2))::integer,
             (count(*) filter (where m = 3))::integer, (count(*) filter (where m = 4))::integer,
             (count(*) filter (where m = 5))::integer, (count(*) filter (where m = 6))::integer,
             (count(*) filter (where m = 7))::integer, (count(*) filter (where m = 8))::integer,
             (count(*) filter (where m = 9))::integer, (count(*) filter (where m = 10))::integer,
             (count(*) filter (where m = 11))::integer, (count(*) filter (where m = 12))::integer
           ] as monthly
    from v
    group by kind, item_id
  )
  select per.kind, per.item_id, coalesce(p.name, b.name), per.n, per.monthly,
         coalesce(s.peak_months, '{}'::smallint[]),
         coalesce(s.peak_weeks, '{}'::smallint[]),
         coalesce(s.busier_next_week, false)
  from per
  cross join allowed
  cross join hist
  left join public.places p on per.kind = 'place' and p.id = per.item_id
  left join public.businesses b on per.kind = 'business' and b.id = per.item_id
  left join public.place_seasonality s on s.kind = per.kind and s.item_id = per.item_id
  where allowed.ok
    and hist.t <= now() - interval '12 months'
    and per.n >= 30;
$$;

revoke execute on function public.report_visit_planning() from public, anon;
grant execute on function public.report_visit_planning() to authenticated, service_role;
