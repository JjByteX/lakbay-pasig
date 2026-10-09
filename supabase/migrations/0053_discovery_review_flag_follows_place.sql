-- Discovery content review flag clears by itself. Human-approved, see
-- docs/discovery-content-plan.md.
--
-- 0012 computes discovery_content.needs_place_review when an entry is saved.
-- Two things were left open there:
--
-- 1. A place entry stayed flagged after its place was verified, until someone
--    re-saved it. Place entries (0050) reach every trail that stops at the
--    place and the publish gate now counts them, so a stale flag would block
--    trails for no reason.
-- 2. A business entry was flagged for good. A business is reviewed for permit
--    and category, not history, so any history written about one has to pass
--    the Places review (admin-panel-spec.md, Trail Publishing exception). But
--    Verify only wrote a log row, so nothing ever cleared the flag.
--
-- Rules after this migration. The app still never sets the flag.
--   Place entry:    flagged while the place is not verified. Follows the place
--                   when its verification_status changes.
--   Business entry: flagged on insert. Cleared by the latest review on it being
--                   Verify, set again by Reject. Set again whenever its title,
--                   content, photo, video or business changes, so a verified
--                   claim cannot be edited without a new check.
--
-- Existing business entries stay flagged until they are verified once more.

-- 0012's trigger on discovery_content already exists and calls this function,
-- so replacing the function is enough. The flag can only be cleared by the
-- review trigger below: it raises a transaction-local switch that this
-- function checks, so a direct write from a client cannot clear a flag.
create or replace function public.compute_discovery_content_needs_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clearing boolean := coalesce(current_setting('lakbay.review_clear', true), '') = 'on';
begin
  if new.related_location_type = 'place' then
    -- related_location_type is 'place' or 'business', enforced by
    -- discovery_content's own check constraint.
    new.needs_place_review := not exists (
      select 1 from public.places
      where id = new.related_location_id
        and verification_status = 'verified'
    );
  elsif tg_op = 'INSERT' then
    new.needs_place_review := true;
  elsif old.related_location_type is distinct from new.related_location_type
     or old.related_location_id is distinct from new.related_location_id
     or old.title is distinct from new.title
     or old.content is distinct from new.content
     or old.photo_url is distinct from new.photo_url
     or old.video_url is distinct from new.video_url then
    new.needs_place_review := true;
  elsif not v_clearing then
    -- Nothing reviewable changed: keep what the database had, whatever the
    -- client sent.
    new.needs_place_review := old.needs_place_review;
  end if;
  return new;
end;
$$;

-- Place entries follow their place.
create function public.sync_discovery_review_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.discovery_content
  set needs_place_review = (new.verification_status <> 'verified')
  where related_location_type = 'place'
    and related_location_id = new.id
    and needs_place_review is distinct from (new.verification_status <> 'verified');
  return new;
end;
$$;

revoke execute on function public.sync_discovery_review_flag() from public, anon, authenticated;

create trigger places_sync_discovery_review_flag
  after update of verification_status on public.places
  for each row
  when (old.verification_status is distinct from new.verification_status)
  execute function public.sync_discovery_review_flag();

-- Business entries follow their latest review. Verify and Reject are still
-- logged in place_reviews as before (0014). Place entries are not touched
-- here: they follow the place.
create function public.apply_discovery_review_to_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reviewed_type = 'discovery_content' then
    perform set_config('lakbay.review_clear', 'on', true);
    update public.discovery_content
    set needs_place_review = (new.action = 'reject')
    where id = new.reviewed_id
      and related_location_type = 'business'
      and needs_place_review is distinct from (new.action = 'reject');
    perform set_config('lakbay.review_clear', 'off', true);
  end if;
  return new;
end;
$$;

revoke execute on function public.apply_discovery_review_to_flag() from public, anon, authenticated;

create trigger place_reviews_apply_discovery_flag
  after insert on public.place_reviews
  for each row
  execute function public.apply_discovery_review_to_flag();

-- The activity log (0037) ignores needs_place_review, so none of these
-- changes writes a log row.
