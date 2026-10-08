-- Discovery content photo. Human-approved: one optional photo per entry, for
-- both kinds (place entries and trail notes). docs/discovery-content-plan.md.
--
-- photo_url holds the public url of one image in the existing content-photos
-- bucket under discovery/, the same stored-public-url shape place_photos,
-- business_photos and landing slides already use. Null means no photo.
-- Existing rows have none.
--
-- Storage write: content_photos_write_staff (0031) already lets admin,
-- manage_places and review_businesses write anywhere in the bucket, which
-- covers the Discovery content tab. Trail notes are written from the trail
-- builder by build_trails staff, who that policy does not cover, so this adds
-- build_trails for the discovery/ folder only. Public read is already
-- bucket wide (content_photos_select_public).

alter table public.discovery_content
  add column photo_url text;

create policy "content_photos_write_discovery_builders"
  on storage.objects for all
  using (
    bucket_id = 'content-photos'
    and name like 'discovery/%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and 'build_trails' = any(p.system_permission)
    )
  )
  with check (
    bucket_id = 'content-photos'
    and name like 'discovery/%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and 'build_trails' = any(p.system_permission)
    )
  );
