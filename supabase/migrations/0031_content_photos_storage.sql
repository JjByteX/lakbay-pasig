-- Content Photos Storage Bucket. Human-confirmed per constraints.md's No
-- Silent Overrides rule and architecture-notes.md's never-touch-without-
-- approval list (schema). Logged in decision-log.md.
--
-- Gap: place_photos.photo_url and business_photos.photo_url have always
-- held a plain text URL, previously pointed at picsum.photos placeholder
-- images per seed.sql's own comments. Real Place and Business photography
-- (docs/feature-scope-changes.md's "Resolved After Meeting With CATO"
-- content task) needs a real, production-usable host instead of a
-- placeholder service, confirmed by the human as something to demo in
-- production, not just local dev. Supabase Storage is the existing
-- dependency already in the stack (architecture-notes.md's Tech Stack),
-- so this is the same bucket-plus-stored-public-URL shape decision-log.md
-- entry #12 already established for profiles.profile_picture (bucket
-- `avatars`, not yet created at that entry's time either), extended here
-- to Place and Business content photos rather than inventing a second
-- pattern.
--
-- One shared bucket, `content-photos`, not one bucket per content type:
-- both place_photos and business_photos already key off their own row's
-- id (place_id/business_id), so a single bucket with type-prefixed object
-- paths (`places/<place_id>/...`, `businesses/<business_id>/...`) covers
-- both without a second bucket to manage for the same purpose.

insert into storage.buckets (id, name, public)
values ('content-photos', 'content-photos', true)
on conflict (id) do nothing;

-- RLS on storage.objects, scoped to this bucket only (bucket_id check in
-- every policy), same permission split as the tables these objects back:
-- place_photos is staff-only write (manage_places or admin, matching
-- 0003's place_photos_write_staff), business_photos is owner-or-staff
-- write (matching 0008's business_photos_write_own/write_staff split).
-- Public read on both since place_photos_select_public/
-- business_photos_select_public already gate the row itself on
-- verification_status, the file behind a verified row's URL has already
-- passed that same gate; a photo file with no matching row is orphaned
-- data, not a security concern gated by this policy.

create policy "content_photos_select_public"
  on storage.objects for select
  using (bucket_id = 'content-photos');

create policy "content_photos_write_staff"
  on storage.objects for all
  using (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (
          p.staff_role = 'admin'
          or 'manage_places' = any(p.system_permission)
          or 'review_businesses' = any(p.system_permission)
        )
    )
  )
  with check (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (
          p.staff_role = 'admin'
          or 'manage_places' = any(p.system_permission)
          or 'review_businesses' = any(p.system_permission)
        )
    )
  );

-- Vendor self-upload: a vendor manages photos for the business they
-- submitted, matching business_photos_write_own's own auth.uid() =
-- submitted_by check. Object path convention (businesses/<business_id>/...)
-- is enforced at the app layer when constructing upload paths, not by this
-- policy, same as route_stops/discovery_content's app-layer stop_type
-- guarantee noted in architecture-notes.md's Known Fragile Areas -- storage
-- policies can filter by bucket and path prefix but this repo has no prior
-- example of parsing a path segment into a policy condition, and adding
-- one here for a single write policy is a heavier pattern than the rest
-- of this migration needs.
create policy "content_photos_write_own_business"
  on storage.objects for all
  using (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.businesses b
      where b.submitted_by = auth.uid()
        and position(b.id::text in name) > 0
    )
  )
  with check (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.businesses b
      where b.submitted_by = auth.uid()
        and position(b.id::text in name) > 0
    )
  );
