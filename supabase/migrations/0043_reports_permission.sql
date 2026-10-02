-- Reports section (reports-plan.md, reports-phases.md Phase 2). Human-approved
-- per constraints.md's No Silent Overrides rule and architecture-notes.md's
-- never-touch-without-approval list (schema, RLS). Logged in decision-log.md
-- entry #36.
--
-- Phase 2.1: system_permission grows a sixth value, view_reports. The check
-- constraint cannot be altered in place, so it is dropped and re-added with
-- the five values 0033 left in place plus the new one, same move 0033 made.
-- 0033 itself is never edited, per README's migration rule.
alter table public.profiles
  drop constraint system_permission_values;

alter table public.profiles
  add constraint system_permission_values check (
    system_permission is null or system_permission <@ array[
      'manage_places',
      'review_businesses',
      'publish_events',
      'build_trails',
      'manage_landing',
      'view_reports'
    ]
  );

-- Phase 2.2: report_points(). The barangay heatmap counts Places and
-- Businesses by pin, verified and pending. A staff member holding only
-- view_reports cannot read pending Places through RLS today:
-- places_select_staff (0003) needs admin or manage_places, and
-- places_select_public returns verified rows only. Pending Businesses are
-- already public (0015), so only Places have the gap.
--
-- Instead of new select policies on places and businesses, which would hand
-- every column of every row (review_notes, reviewed_by, submitted_by) to a
-- permission that only needs counts, this one definer function returns five
-- columns and nothing else. Same header shape as 0009/0010/0037: security
-- definer plus a pinned search_path.
--
-- Caller check mirrors 0033's write policy: an active profile that is either
-- admin or holds view_reports. Anyone else (resident, signed out, staff with
-- other permissions only, inactive staff) gets zero rows, not an error, so
-- the page decides what to show.
--
-- Rows with null latitude or longitude are returned on purpose, not
-- filtered: the heatmap's "no pin" note counts them. Rejected Places and
-- unverified Businesses are excluded, they are not content CATO is counting.
create function public.report_points()
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
  from public.places p, allowed
  where allowed.ok
    and p.verification_status in ('pending', 'verified')
  union all
  select 'business'::text, b.id, b.latitude, b.longitude, b.verification_status
  from public.businesses b, allowed
  where allowed.ok
    and b.verification_status in ('pending', 'verified');
$$;

revoke execute on function public.report_points() from public, anon;
grant execute on function public.report_points() to authenticated;

-- Same reload 0042 ends with, so PostgREST sees report_points() without a
-- restart. If the page still says it cannot find the function, the migration
-- has not been applied to this database: run npm run db:reset.
notify pgrst, 'reload schema';
