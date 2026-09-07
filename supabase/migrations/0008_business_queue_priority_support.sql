-- Build 3, phase 6.1 follow-up.
-- src/lib/business-queue-priority.ts implements the four review queue
-- signals from vendor-mode-spec.md, but two of them, "no photos" and "new
-- accounts", had no schema support to read from. Confirmed as real gaps,
-- not just caution, and fixed here with explicit human approval, since
-- migrations and RLS policies are otherwise not touched without it per
-- architecture-notes.md.

-- Part 1: business_photos.
-- data-model.md lists "Pictures" under Local Business, and vendor-mode-spec.md
-- names "no photos" as a queue signal, but 0004_businesses.sql never added
-- anywhere to store one, unlike place_photos in 0003_places.sql. Shape
-- mirrors place_photos: rows, not an array column, so each photo can carry
-- its own order. No historical/current split, businesses don't have that
-- distinction in data-model.md, "Pictures" is a single set.
create table public.business_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  photo_url text not null,
  sort_order int not null default 0
);

-- RLS on business_photos. Unlike place_photos (staff-only write, since CATO
-- staff create and edit Place entries directly per admin-panel-spec.md),
-- Businesses are self-submitted by vendors, Tier 1 listing goes live
-- instantly per vendor-mode-spec.md, so write access follows the same
-- owner-plus-staff shape already used for business_items in 0004, not the
-- staff-only shape used for place_photos.
alter table public.business_photos enable row level security;

create policy "business_photos_select_public"
  on public.business_photos for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.verification_status = 'verified'
    )
  );

create policy "business_photos_select_own"
  on public.business_photos for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.submitted_by = auth.uid()
    )
  );

create policy "business_photos_write_own"
  on public.business_photos for all
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.submitted_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.submitted_by = auth.uid()
    )
  );

create policy "business_photos_write_staff"
  on public.business_photos for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );

-- Part 2: profiles read access for business reviewers.
-- profiles_select_admin (0001) only lets staff_role = 'admin' read another
-- account's row. A Staff reviewer with only review_businesses had no way to
-- read a vendor's created_at to evaluate the "new account" signal.
-- Scoped narrowly: a profile only becomes readable this way if it has
-- actually submitted a business, and only to staff with review_businesses
-- or admin. This does not open up profiles browsing generally, a resident
-- who never listed a business stays invisible to Business review staff.
-- RLS guards the row, not columns, same limitation already documented in
-- 0001 and 0004: this policy exposes the full profiles row, including
-- contact_number and date_of_birth, to a matching reviewer, not just
-- created_at. The app layer must select only the created_at column when
-- querying this for queue priority, and must not surface the rest of a
-- vendor's profile in a review screen without a reason tied to that review.
create policy "profiles_select_staff_business_submitters"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
    and exists (
      select 1 from public.businesses b
      where b.submitted_by = profiles.id
    )
  );
