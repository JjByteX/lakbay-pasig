-- Fiestas, part 2. Human-approved per constraints.md's No Silent Overrides
-- rule and architecture-notes.md's never-touch-without-approval list
-- (schema, RLS, definer function). Five small changes that all hang off
-- 0044_fiestas.sql. 0043 and 0044 are never edited, per README's migration
-- rule.

-- 1. Barangay Hall place category. Residents find a barangay's fiesta from
-- its hall's place page (Fiesta tab, discover-place-detail.tsx), and the
-- Reports heatmap skips this category (change 2), so both read the category
-- by name. Renaming it in Categories breaks both until the code constant
-- BARANGAY_HALL_CATEGORY in src/lib/fiestas.ts and the exclusion below are
-- updated to the new name. 'building' is the Government / Civic icon from
-- place-category-icons.ts. A no-op if the category already exists.
insert into public.place_categories (name, icon, sort_order)
select 'Barangay Hall', 'building', coalesce(max(sort_order), 0) + 1
from public.place_categories
on conflict (name) do nothing;

-- 2. report_points() skips Barangay Hall places. Every barangay has a hall,
-- so counting them adds one to every barangay and says nothing about how much
-- content CATO has there, and it would make empty barangays look filled,
-- hiding the gaps the heatmap exists to show. Same function as 0043 with one
-- more join and one more condition: signature, columns, caller check and
-- grants unchanged. left join so a place with no category row is still
-- counted, never silently dropped.
create or replace function public.report_points()
returns table (
  kind text,
  id uuid,
  latitude double precision,
  longitude double precision,
  verification_status text
)
language sql
security definer
set search_path = public
stable
as $$
  with allowed as (
    select exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.active_status = 'active'
        and (pr.staff_role = 'admin' or 'view_reports' = any(pr.system_permission))
    ) as ok
  )
  select 'place'::text, p.id, p.latitude, p.longitude, p.verification_status
  from public.places p
  left join public.place_categories pc on pc.id = p.category_id, allowed
  where allowed.ok
    and p.verification_status in ('pending', 'verified')
    and coalesce(pc.name, '') <> 'Barangay Hall'
  union all
  select 'business'::text, b.id, b.latitude, b.longitude, b.verification_status
  from public.businesses b, allowed
  where allowed.ok
    and b.verification_status in ('pending', 'verified');
$$;

revoke execute on function public.report_points() from public, anon;
grant execute on function public.report_points() to authenticated;

-- 2b. report_fiesta_coverage(): the counts behind the Reports > Fiesta
-- coverage page ("which barangays have no fiesta entered, or only drafts").
-- It cannot be a plain select: a staff member holding only view_reports may
-- not read draft fiestas through fiestas_select_staff (publish_events or
-- admin only), and the public policy returns published rows only, so the
-- draft counts would silently read as zero. Same answer 0043 gave for
-- places: a counts-only definer function, never a wider select policy.
-- It returns a barangay name and two numbers, no fiesta names, dates or
-- saints, so view_reports learns nothing it could not already see as counts.
--
-- One row per barangay that carries at least one tag. The barangays with no
-- tagged fiesta are not returned: the closed list lives in the page, which
-- fills them in as zero (that is the gap the report exists to show). One row
-- has a null barangay: fiestas with no tag at all (city-wide, or community
-- only). A fiesta tagged to several barangays counts once under each, so the
-- page never adds the rows into a grand total. Same caller check as
-- report_points(): zero rows, not an error, for anyone else.
create function public.report_fiesta_coverage()
returns table (
  barangay text,
  published_count integer,
  draft_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  with allowed as (
    select exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.active_status = 'active'
        and (pr.staff_role = 'admin' or 'view_reports' = any(pr.system_permission))
    ) as ok
  )
  select
    ft.barangay,
    (count(*) filter (where f.published))::integer,
    (count(*) filter (where not f.published))::integer
  from public.fiestas f
  left join public.fiesta_barangays ft on ft.fiesta_id = f.id, allowed
  where allowed.ok
  group by ft.barangay;
$$;

revoke execute on function public.report_fiesta_coverage() from public, anon;
grant execute on function public.report_fiesta_coverage() to authenticated;

-- 3. search_fiestas(). Same shape as search_events (0042): normalized
-- substring match first, then trigram and fuzzy match for typos, ranked by
-- tier and similarity. Not a definer function, so the caller's RLS applies:
-- a signed-out visitor only ever reaches published rows, and only_published
-- (default true) also holds for a staff caller, same as search_events.
-- What is searched is the name, community, patron saint and the barangay
-- tags together, so "Kalawaan" finds a fiesta whose name does not contain it.
create or replace function public.search_fiestas(q text, lim int default 5, only_published boolean default true)
returns setof public.fiestas
language plpgsql stable
set search_path = public, extensions
as $$
declare
  qn text := public.search_norm(left(q, 100));
begin
  if coalesce(qn, '') = '' then return; end if;
  perform set_config('pg_trgm.word_similarity_threshold', '0.2', true);
  return query
    select f.*
    from public.fiestas f
    cross join lateral (
      select public.search_norm(concat_ws(' ',
        f.name,
        f.community,
        f.patron_saint,
        (select string_agg(b.barangay, ' ') from public.fiesta_barangays b where b.fiesta_id = f.id)
      )) as hay
    ) h
    where (not only_published or f.published)
      and (h.hay like '%' || qn || '%'
           or (char_length(qn) >= 3
               and qn <% h.hay
               and (word_similarity(qn, h.hay) >= 0.5
                    or public.search_fuzzy(qn, h.hay))))
    order by public.search_tier(h.hay, qn),
             word_similarity(qn, h.hay) desc,
             f.name
    limit lim;
end
$$;

-- 4. Activity log. activity_log_target_type_check (0037) is a closed list,
-- so it is dropped and re-added with 'fiesta'; 0037 itself is never edited.
-- log_activity() needs no change: a fiesta insert, edit and delete log
-- through it as is, labelled by name. Publishing logs as an 'updated' row
-- that lists the published change, not as 'published', because that flip is
-- wired per table name inside log_activity() and rewriting that function is
-- not worth it for one table. Barangay tag edits are not logged on their own.
alter table public.activity_log
  drop constraint activity_log_target_type_check;

alter table public.activity_log
  add constraint activity_log_target_type_check check (target_type in (
    'place', 'business', 'event', 'trail',
    'discovery_content', 'landing_slide',
    'place_category', 'trail_category', 'event_category', 'business_category', 'place_facility',
    'fiesta',
    'staff', 'auth'
  ));

create trigger activity_log_fiestas
  after insert or update or delete on public.fiestas
  for each row execute function public.log_activity('fiesta', 'name');

-- Same reload 0042, 0043 and 0044 end with.
notify pgrst, 'reload schema';
