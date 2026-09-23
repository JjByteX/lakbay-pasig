-- Item photos. Human-confirmed per constraints.md's No Silent Overrides
-- rule and architecture-notes.md's never-touch-without-approval list
-- (schema, RLS). Logged in decision-log.md. Full design in
-- item-photos-plan.md.
--
-- business_items (0004) is name and price only, no photo. Optional photos
-- per item, vendor upload and remove, staff view only, matching the
-- owner-plus-staff shape business_photos already uses for the business as
-- a whole (0008), one level deeper through item_id -> business_id.

create table public.business_item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.business_items(id) on delete cascade,
  photo_url text not null,
  sort_order int not null default 0
);

-- RLS. Public select matches business_items_select_public exactly
-- (0016's widen to 'verified' or 'pending'), checked directly rather than
-- assumed, so a pending listing's item photos aren't invisible while the
-- item's own name and price already show under that same widen.
alter table public.business_item_photos enable row level security;

create policy "business_item_photos_select_public"
  on public.business_item_photos for select
  using (
    exists (
      select 1 from public.business_items bi
      join public.businesses b on b.id = bi.business_id
      where bi.id = item_id and b.verification_status in ('verified', 'pending')
    )
  );

create policy "business_item_photos_select_own"
  on public.business_item_photos for select
  using (
    exists (
      select 1 from public.business_items bi
      join public.businesses b on b.id = bi.business_id
      where bi.id = item_id and b.submitted_by = auth.uid()
    )
  );

create policy "business_item_photos_write_own"
  on public.business_item_photos for all
  using (
    exists (
      select 1 from public.business_items bi
      join public.businesses b on b.id = bi.business_id
      where bi.id = item_id and b.submitted_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.business_items bi
      join public.businesses b on b.id = bi.business_id
      where bi.id = item_id and b.submitted_by = auth.uid()
    )
  );

create policy "business_item_photos_write_staff"
  on public.business_item_photos for all
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

-- No log_activity trigger. Checked 0037_activity_log.sql directly:
-- business_items and business_photos are both named in that migration's
-- own "Not attached" list, since neither has a staff write screen, staff
-- review of items is read only (admin-business-detail.tsx's ItemList).
-- This table follows the same reasoning as its two closest relatives, not
-- a reason to add a trigger 0037 deliberately left off both.

-- Storage: no new policy. content-photos' content_photos_write_own_business
-- (0031) checks only that the business id appears anywhere in the object
-- path, so a path of businesses/<business_id>/items/<item_id>/... is
-- already covered, same bucket item photos share with every other place
-- and business photo.
