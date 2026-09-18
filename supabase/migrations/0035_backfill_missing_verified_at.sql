-- Backfill verified_at for any place/business that is verification_status
-- = 'verified' but has a null verified_at.
--
-- Root cause of the empty Home/Features photo showcase (found by checking
-- the person's own theory during debugging, not by the carousel/layout
-- work in the migration before this one -- that work was real and worth
-- keeping, but it was not the actual cause of an empty showcase):
-- fetchRecentlyVerifiedPlaces/fetchRecentlyVerifiedBusinesses (home-
-- query.ts) filter on `.not("verified_at", "is", null)`, not on
-- verification_status directly, per migration 0017's own comment: a row
-- only gets verified_at when it transitions through the app's own
-- handleReviewSubmit path (admin-place-detail.tsx/admin-business-
-- detail.tsx's Verify action), not from verification_status being set to
-- 'verified' by any other means (direct SQL insert/update, a seed-style
-- insert, a manual dashboard edit). A row in that state looks fully
-- verified everywhere else in the app -- Discover shows it, the admin
-- list shows it verified -- but is entirely invisible to
-- fetchRecentlyVerifiedPlaces/Businesses, and therefore to
-- buildCategoryRows and its fallbackItems list too: a row that fails this
-- filter never reaches either bucket, verified_at is checked upstream of
-- the photo-presence check this file's previous migration's own header
-- comment focused on.
--
-- Migration 0017 already ran this exact backfill once, for every row
-- verified at that time. This repeats the same logic for anything that
-- has entered the same state since -- idempotent by construction, since
-- it only ever touches rows still sitting at verified_at is null;
-- already-backfilled rows are untouched on a re-run, not just skipped.
update public.places
  set verified_at = updated_at
  where verification_status = 'verified'
    and verified_at is null;

update public.businesses
  set verified_at = updated_at
  where verification_status = 'verified'
    and verified_at is null;
