-- Fix content_photos_write_own_business (was 0031).
--
-- The old check was position(b.id::text in name). Inside the subquery over
-- businesses, the bare `name` resolved to businesses.name, not the file path,
-- so the policy never matched and only staff could upload business photos.
-- This version compares the file path (storage.objects.name) and is stricter
-- than the original intent: the path must start with businesses/<id>/ for a
-- business the signed-in account submitted, not merely contain the id.
-- The app already uploads under that prefix (src/lib/vendor-items.ts).

drop policy if exists "content_photos_write_own_business" on storage.objects;

create policy "content_photos_write_own_business"
  on storage.objects for all
  using (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.businesses b
      where b.submitted_by = auth.uid()
        and storage.objects.name like 'businesses/' || b.id::text || '/%'
    )
  )
  with check (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.businesses b
      where b.submitted_by = auth.uid()
        and storage.objects.name like 'businesses/' || b.id::text || '/%'
    )
  );
