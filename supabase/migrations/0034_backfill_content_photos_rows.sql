-- Backfill place_photos and landing_slides rows for files that already
-- exist in the content-photos bucket but have no matching database row.
--
-- Root cause (this migration exists to repair, not to change going
-- forward): every read path that shows a photo -- category-photo-row.tsx's
-- CategoryPhotoRow (Home, Features), HeroCarousel's landing slides,
-- home-query.ts's fetchCoverPhotoUrls -- reads from place_photos/
-- business_photos/landing_slides, never from storage.objects directly.
-- A file uploaded straight into the Supabase Storage dashboard (bypassing
-- admin-place-detail.tsx's handlePhotoSelected / slide-form-dialog.tsx's
-- own insert, both of which write the file AND the row together) lands in
-- the bucket but is invisible everywhere in the app: home-query.ts's
-- buildCategoryRows silently routes any place/business with no
-- coverPhotoUrl into its photoless/fallbackItems bucket rather than
-- rendering a card with a broken image, so the entire showcase can end up
-- empty with no error, no broken-image icon, nothing -- exactly the
-- "nothing at all, not even a box" symptom this was written to fix.
--
-- This migration is idempotent (safe to re-run): every insert is guarded
-- by a NOT EXISTS check against the already-recorded photo_url/image_url,
-- so files that already have a row are skipped, not duplicated.
--
-- Scope: place_photos and landing_slides only. business_photos is
-- deliberately NOT covered here -- there is no business-photo upload flow
-- anywhere in the app yet (admin-business-detail.tsx has none), so there
-- is no established storage path convention to parse a business_id out
-- of, unlike place photos' own <place_id>/<photo_type>/<filename>
-- convention (confirmed against a real uploaded file's path during
-- debugging) and landing slides' own landing/<filename> convention
-- (confirmed the same way).

-- Place photos: storage.objects.name is "<place_id>/<photo_type>/<filename>"
-- per admin-place-detail.tsx's own upload path (`${id}/${photoType}/${crypto
-- .randomUUID()}-${file.name}`). photo_type is validated against the same
-- ('historical', 'current') check place_photos.photo_type already
-- enforces; any object whose middle path segment isn't one of those two
-- values is left alone rather than guessed at (a defensive filter, not
-- expected to exclude anything given the convention this bucket has
-- always followed).
--
-- Project's public storage URL below is hardcoded rather than read from a
-- Postgres setting (no app.settings.supabase_url or equivalent exists
-- anywhere in this project's migrations -- checked before writing this),
-- and matches the exact host confirmed working during debugging (every
-- getPublicUrl() call in the app -- avatar-storage.ts, landing-slides.ts,
-- admin-place-detail.tsx -- resolves the same base for this same
-- project). If this project is ever migrated to a different Supabase
-- project, this literal needs updating alongside VITE_SUPABASE_URL.
insert into public.place_photos (place_id, photo_url, photo_type, sort_order)
select
  (string_to_array(o.name, '/'))[1]::uuid as place_id,
  concat(
    'https://nahkkqlrpwtqsdatftbj.supabase.co/storage/v1/object/public/content-photos/',
    o.name
  ) as photo_url,
  (string_to_array(o.name, '/'))[2] as photo_type,
  0 as sort_order
from storage.objects o
where o.bucket_id = 'content-photos'
  and array_length(string_to_array(o.name, '/'), 1) = 3
  and (string_to_array(o.name, '/'))[2] in ('historical', 'current')
  and exists (
    select 1 from public.places p where p.id = (string_to_array(o.name, '/'))[1]::uuid
  )
  and not exists (
    select 1 from public.place_photos pp
    where pp.photo_url like concat('%/content-photos/', o.name)
  );

-- Landing slides: storage.objects.name is "landing/<filename>" per
-- slide-form-dialog.tsx's own upload path (`landing/${crypto.randomUUID()}
-- -${file.name}`). A backfilled slide is inserted as inactive (active =
-- false) rather than active = true: unlike place photos (which only ever
-- attach to an existing, already-reviewed place), a landing slide's
-- caption and display order are real editorial choices admin-landing.tsx's
-- own form asks for -- this migration has no caption to give it and no
-- basis for where in sort_order it belongs, so it surfaces in Admin ->
-- Landing Page for a human to caption, order, and activate, rather than
-- silently going live on the public site with a blank caption.
insert into public.landing_slides (image_url, caption, sort_order, active)
select
  concat(
    'https://nahkkqlrpwtqsdatftbj.supabase.co/storage/v1/object/public/content-photos/',
    o.name
  ) as image_url,
  '' as caption,
  -- row_number(), not a max()+1 scalar subquery: a scalar subquery
  -- evaluates once for the whole insert, not per row, so more than one
  -- orphaned slide file in the same run would all receive the identical
  -- sort_order value rather than each getting the next one in sequence.
  (select coalesce(max(sort_order), -1) from public.landing_slides)
    + row_number() over (order by o.name) as sort_order,
  false as active
from storage.objects o
where o.bucket_id = 'content-photos'
  and o.name like 'landing/%'
  and array_length(string_to_array(o.name, '/'), 1) = 2
  and not exists (
    select 1 from public.landing_slides ls
    where ls.image_url like concat('%/content-photos/', o.name)
  );
