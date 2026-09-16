-- Landing page hero carousel. Human-confirmed per constraints.md's No
-- Silent Overrides rule and architecture-notes.md's never-touch-without-
-- approval list (schema). Logged in decision-log.md.
--
-- Phase 1.1: system_permission grows a fifth value, manage_landing. The
-- check constraint added in 0002 cannot be altered in place, so it is
-- dropped and re-added here with the same four original values plus the
-- new one. 0002 itself is never edited, per README's migration rule
-- (never edit a migration already merged to main, add a new one instead).
alter table public.profiles
  drop constraint system_permission_values;

alter table public.profiles
  add constraint system_permission_values check (
    system_permission is null or system_permission <@ array[
      'manage_places',
      'review_businesses',
      'publish_events',
      'build_trails',
      'manage_landing'
    ]
  );

-- Phase 1.3: landing_slides. Own table, not a caption column on
-- place_photos/business_photos -- open-questions.md #6 already resolved
-- those two as no caption column, this is a separate table for a
-- separate purpose (landing page hero content, not a Place or Business
-- record), so that answer stands untouched.
create table public.landing_slides (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phase 1.4/1.5/1.6: RLS. Public select has no `to` clause and is gated
-- only on active, not on any staff/auth check -- the landing page and
-- the login/signup popups both render for a signed-out visitor, so a
-- staff-scoped read would show an empty hero to every real visitor.
-- Write policy mirrors 0003's places_write_staff shape exactly: same
-- active_status/staff_role/system_permission check, same for-all with
-- using and with check both present.
alter table public.landing_slides enable row level security;

create policy "landing_slides_select_public"
  on public.landing_slides for select
  using (active);

create policy "landing_slides_write_staff"
  on public.landing_slides for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_landing' = any(p.system_permission))
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_landing' = any(p.system_permission))
    )
  );

-- Phase 1.7: storage gap. 0031's content_photos_write_staff only checks
-- for admin, manage_places, or review_businesses -- a staff member
-- holding only manage_landing would pass the landing_slides table insert
-- above and then fail the file upload itself. Policies on storage.objects
-- are OR'd, so this adds coverage for the new permission without editing
-- 0031, which is already merged. Object paths for this bucket use
-- landing/<uuid>-<filename>, alongside the existing places/ and
-- businesses/ prefixes.
create policy "landing_photos_write_staff"
  on storage.objects for all
  using (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_landing' = any(p.system_permission))
    )
  )
  with check (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_landing' = any(p.system_permission))
    )
  );
