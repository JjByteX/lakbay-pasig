-- Runnable check for activity_log (0037). Not a migration, not part of
-- db:reset. Run by hand after every db:reset while 0037 is being built:
--
--   docker exec -i supabase_db_lakbay-pasig psql -U postgres -v ON_ERROR_STOP=1 < supabase/activity_log_check.sql
--
-- (container name follows supabase/config.toml's project_id, "lakbay-pasig".)
--
-- begin/rollback wraps the whole file, so every insert, update, and role
-- switch below leaves no trace once it finishes -- safe to run against a
-- freshly-seeded local database as many times as needed. ON_ERROR_STOP=1
-- means the first failed assert stops the script instead of rolling
-- silently past it; a failed check gets fixed and re-run, per
-- activity-log-phases.md's Ground Rules, it is not a stop.
--
-- Each Phase 1/2/3 subphase in activity-log-phases.md that ends in
-- "Check" or "grow the check" adds asserts below its own phase's heading.
-- This file starts empty of asserts -- Phase 1 adds the first ones.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Supabase's local Postgres has no real GoTrue session inside a plain psql
-- connection, so RLS policies that read auth.uid() need a stand-in: set the
-- session to the `authenticated` role and populate request.jwt.claims with
-- the demo user's own id, the same two settings PostgREST sets per-request
-- in production. `as_user(uuid)` does both in one call; `as_owner()` drops
-- back to the unrestricted superuser session so setup/teardown between
-- asserts (seeding fixture rows, reading actual counts) doesn't itself get
-- blocked by the RLS this check is trying to test.

create or replace function pg_temp.as_user(p_user_id uuid) returns void as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

create or replace function pg_temp.as_owner() returns void as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

create or replace function pg_temp.as_anon() returns void as $$
begin
  set local role anon;
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

-- Demo account ids, from supabase/seed.sql. Named here once so later
-- phases' asserts read as "admin1", not a bare uuid.
create temp table pg_temp.demo_users (name text primary key, id uuid not null);
insert into pg_temp.demo_users (name, id) values
  ('admin1',        'f25e552f-e90c-4fc4-884e-02f46c40a47f'),  -- staff_role admin, active
  ('admin2',        'ab395d2b-a446-4892-b43f-2170af876c8a'),  -- staff_role admin, active
  ('staff.places',  '6456adca-58a3-48c3-b0e6-6a086d03734f'),  -- staff_role staff, manage_places, active
  ('staff.business','fed52550-3ee1-48da-b033-211f6245fbb6'),  -- staff_role staff, review_businesses, active
  ('staff.events',  'e283c6fb-4dcd-455f-a60c-e35add77a330'),  -- staff_role staff, publish_events+build_trails, INACTIVE
  ('resident1',     'ed8d4b57-6a77-418b-9db3-11c18e18fbca'),  -- role resident, no staff_role
  ('vendor1',        'a77bf9f3-1107-4e9e-9677-ebbcaa662cba'); -- role resident + owns a business

-- ---------------------------------------------------------------------------
-- Phase 1: table, RLS, grants.
-- ---------------------------------------------------------------------------
-- One fixture row, inserted as owner (mirrors write_activity() being
-- security definer -- nothing in Phase 1 yet grants authenticated the
-- ability to insert directly, and this check confirms that's still true
-- at the end of the block, not just at the start).
select pg_temp.as_owner();

insert into public.activity_log (actor_id, actor_name, actor_role, action, target_type, target_id, target_label, details)
select id, 'Demo Admin One', 'admin', 'updated', 'place', gen_random_uuid(), 'Rizal Shrine', '{"changed": {"description": {"from": "old", "to": "new"}}}'::jsonb
from pg_temp.demo_users where name = 'admin1';

do $$
begin
  if (select count(*) from public.activity_log) <> 1 then
    raise exception 'Phase 1.6: expected 1 fixture row after owner insert, found %', (select count(*) from public.activity_log);
  end if;
end $$;

-- admin1 (active admin) reads the fixture row.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'admin1'));

do $$
begin
  if (select count(*) from public.activity_log) <> 1 then
    raise exception 'Phase 1.6: admin1 expected to read 1 row, saw %', (select count(*) from public.activity_log);
  end if;
end $$;

-- staff.places (active staff, not admin) reads zero rows.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));

do $$
begin
  if (select count(*) from public.activity_log) <> 0 then
    raise exception 'Phase 1.6: staff.places expected to read 0 rows, saw %', (select count(*) from public.activity_log);
  end if;
end $$;

-- anon is denied entirely (revoke all).
select pg_temp.as_anon();

do $$
begin
  begin
    perform count(*) from public.activity_log;
    raise exception 'Phase 1.6: anon select should have been denied by privilege revoke, was not';
  exception
    when insufficient_privilege then
      null; -- expected
  end;
end $$;

-- authenticated cannot insert, update, or delete, even as a real row owner
-- would try to -- the revoke in Phase 1.5 blocks this before RLS is even
-- consulted.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));

do $$
begin
  begin
    insert into public.activity_log (actor_id, actor_name, actor_role, action, target_type, target_label)
    values ((select id from pg_temp.demo_users where name = 'staff.places'), 'x', 'staff', 'updated', 'place', 'x');
    raise exception 'Phase 1.6: authenticated insert should have been denied, was not';
  exception
    when insufficient_privilege then
      null; -- expected
  end;
end $$;

do $$
begin
  begin
    update public.activity_log set target_label = 'changed' where true;
    raise exception 'Phase 1.6: authenticated update should have been denied, was not';
  exception
    when insufficient_privilege then
      null; -- expected
  end;
end $$;

do $$
begin
  begin
    delete from public.activity_log where true;
    raise exception 'Phase 1.6: authenticated delete should have been denied, was not';
  exception
    when insufficient_privilege then
      null; -- expected
  end;
end $$;

select pg_temp.as_owner();

-- ---------------------------------------------------------------------------
-- Phase 2: capture (write_activity, the three trigger functions, triggers,
-- log_auth_event).
-- ---------------------------------------------------------------------------

-- Seed leaves the log empty: the CLI's seed step runs as the postgres
-- superuser, auth.uid() is null there, so every trigger's write_activity()
-- call falls through the "no matching active staff/admin actor" branch and
-- writes nothing. This is checked against the actual post-db:reset state
-- (before this file's own fixture inserts below add anything), so run this
-- file immediately after db:reset, not after some other manual poking.
do $$
begin
  if (select count(*) from public.activity_log) <> 0 then
    raise exception 'Phase 2.7: expected an empty log straight after db:reset (seed writes as owner), found % rows', (select count(*) from public.activity_log);
  end if;
end $$;

-- staff.places creates then edits a place: one created, one updated. A
-- second edit inside 60 seconds adds nothing (the merge window).
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));

-- category_id is not null since 0022, so every fixture place needs a real
-- one. staff.places can read place_categories (place_categories_select_staff,
-- manage_places), so the subquery resolves under RLS as this user.
insert into public.places (id, name, address, category_id, verification_status)
values ('11111111-0000-0000-0000-000000000001', 'Check Fixture Place', '123 Test St, Pasig', (select id from public.place_categories order by sort_order limit 1), 'pending');

update public.places set description = 'First edit' where id = '11111111-0000-0000-0000-000000000001';
update public.places set description = 'Second edit, same minute' where id = '11111111-0000-0000-0000-000000000001';

select pg_temp.as_owner();

do $$
declare
  v_created int;
  v_updated int;
begin
  select count(*) into v_created from public.activity_log where target_type = 'place' and target_id = '11111111-0000-0000-0000-000000000001' and action = 'created';
  select count(*) into v_updated from public.activity_log where target_type = 'place' and target_id = '11111111-0000-0000-0000-000000000001' and action = 'updated';
  if v_created <> 1 then
    raise exception 'Phase 2.7: expected 1 created row for the fixture place, found %', v_created;
  end if;
  if v_updated <> 1 then
    raise exception 'Phase 2.7: expected 1 updated row after two edits inside 60s (merge should collapse them), found %', v_updated;
  end if;
end $$;

-- Empty is empty: admin-place-detail.tsx hydrates every null text column as
-- "" and saves {...form} back, so an open-then-Save with no edits sends
-- null -> "" on every optional field. That must log nothing. Uses a second
-- place so the fixture place above (whose 60-second merge window is already
-- consumed) can't mask a wrong result: a fresh place has no earlier
-- 'updated' row to merge into, so any row here would be a real false
-- positive, not a merge artifact.
select pg_temp.as_owner();

insert into public.places (id, name, address, category_id, verification_status)
values ('11111111-0000-0000-0000-000000000009', 'Check Fixture Noop Place', '9 Noop St, Pasig', (select id from public.place_categories order by sort_order limit 1), 'pending');

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));

update public.places set
  description = '', historical_background = '', historical_significance = '',
  year_or_period = '', source_reference = '', operating_hours = '',
  visit_duration = '', accessibility_info = '',
  facility_ids = '{}'
where id = '11111111-0000-0000-0000-000000000009';

select pg_temp.as_owner();

do $$
declare
  v_noop_rows int;
begin
  select count(*) into v_noop_rows from public.activity_log where target_id = '11111111-0000-0000-0000-000000000009';
  if v_noop_rows <> 0 then
    raise exception 'Phase 2.7: expected 0 rows from a save that only turned null into "" (owner-created fixture, so nothing else logs for it), found %', v_noop_rows;
  end if;
end $$;

-- ...but a real change on the same record still logs. This is what stops
-- the normalization above from having quietly turned every edit into a
-- no-op: "" -> 'Real text' must still count.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));
update public.places set description = 'Real text' where id = '11111111-0000-0000-0000-000000000009';
select pg_temp.as_owner();

do $$
declare
  v_real_rows int;
begin
  select count(*) into v_real_rows from public.activity_log where target_id = '11111111-0000-0000-0000-000000000009' and action = 'updated';
  if v_real_rows <> 1 then
    raise exception 'Phase 2.7: expected 1 updated row for a real ""-to-text change after the no-op save, found %', v_real_rows;
  end if;
end $$;

-- Either side over 120 characters blanks BOTH sides (plan, Details Shape),
-- so the admin page can read a one-sided null as "was empty / cleared" and
-- both-null as "changed, text too long to keep". The fixture starts with a
-- short description (set as owner, so it logs nothing) and staff grows it
-- past 120 characters: the old per-side rule would have kept from =
-- 'short before' and only blanked to. A fresh place, so no earlier
-- 'updated' row exists to merge into. `#>` returns a JSON null (not a SQL
-- NULL) for a stored null, so the check compares against 'null'::jsonb; a
-- missing row would leave both variables SQL NULL and also fail.
select pg_temp.as_owner();

insert into public.places (id, name, address, description, category_id, verification_status)
values ('11111111-0000-0000-0000-000000000008', 'Check Fixture Long Text Place', '8 Long St, Pasig', 'short before', (select id from public.place_categories order by sort_order limit 1), 'pending');

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));
update public.places set description = repeat('x', 121) where id = '11111111-0000-0000-0000-000000000008';
select pg_temp.as_owner();

do $$
declare
  v_from jsonb;
  v_to jsonb;
begin
  select details #> '{changed,description,from}', details #> '{changed,description,to}'
    into v_from, v_to
  from public.activity_log
  where target_id = '11111111-0000-0000-0000-000000000008' and action = 'updated';
  if v_from is distinct from 'null'::jsonb or v_to is distinct from 'null'::jsonb then
    raise exception 'Phase 2.7: expected a description edit past 120 characters to blank BOTH from and to (JSON null), got from=% to=%', v_from, v_to;
  end if;
end $$;

-- Known limit of this file: it runs inside one begin/rollback, so now() is
-- frozen at the transaction's start and every row shares one created_at.
-- That is enough to prove the merge window collapses edits, but it cannot
-- prove the window EXPIRES after 60 seconds. That one rule is verified by
-- reading write_activity(), not by this check.

-- Verify (review insert, then status update): exactly one verified.
-- Reject with a note: one rejected, note carried in details.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));

-- place_reviews.place_id was replaced by reviewed_type/reviewed_id in 0014.
insert into public.place_reviews (reviewed_type, reviewed_id, staff_id, action)
values ('place', '11111111-0000-0000-0000-000000000001', (select id from pg_temp.demo_users where name = 'staff.places'), 'verify');
update public.places set verification_status = 'verified' where id = '11111111-0000-0000-0000-000000000001';

insert into public.places (id, name, address, category_id, verification_status)
values ('11111111-0000-0000-0000-000000000002', 'Check Fixture Place Two', '456 Test St, Pasig', (select id from public.place_categories order by sort_order limit 1), 'pending');
insert into public.place_reviews (reviewed_type, reviewed_id, staff_id, action, notes)
values ('place', '11111111-0000-0000-0000-000000000002', (select id from pg_temp.demo_users where name = 'staff.places'), 'reject', 'Missing source citation');
update public.places set verification_status = 'rejected' where id = '11111111-0000-0000-0000-000000000002';

select pg_temp.as_owner();

do $$
declare
  v_verified int;
  v_rejected int;
  v_reject_notes text;
begin
  select count(*) into v_verified from public.activity_log where target_type = 'place' and target_id = '11111111-0000-0000-0000-000000000001' and action = 'verified';
  select count(*) into v_rejected from public.activity_log where target_type = 'place' and target_id = '11111111-0000-0000-0000-000000000002' and action = 'rejected';
  select details ->> 'notes' into v_reject_notes from public.activity_log where target_type = 'place' and target_id = '11111111-0000-0000-0000-000000000002' and action = 'rejected';
  if v_verified <> 1 then
    raise exception 'Phase 2.7: expected 1 verified row, found %. verification_status on places must not also log a second row (places ignores verification_status per the plan''s ignore list)', v_verified;
  end if;
  if v_rejected <> 1 then
    raise exception 'Phase 2.7: expected 1 rejected row, found %', v_rejected;
  end if;
  if v_reject_notes is distinct from 'Missing source citation' then
    raise exception 'Phase 2.7: expected rejected row''s details.notes to carry the review note, got %', v_reject_notes;
  end if;
end $$;

-- Feature toggle (review insert, then flip): exactly one featured. Flip
-- back: one unfeatured. business_reviews' own 'feature' action must not
-- also produce a row (log_review_activity skips it).
-- The fixture business is created as owner: staff have no INSERT policy on
-- businesses (0004 only has businesses_insert_own, auth.uid() = submitted_by,
-- since vendors are the only creators), so inserting it as staff.business
-- with submitted_by = vendor1 would be rejected by RLS before any trigger
-- ran. Owner context has no auth.uid(), so this insert logs nothing, same
-- as a vendor creating a listing in production. Only the staff actions
-- below run as staff.business.
select pg_temp.as_owner();

insert into public.businesses (id, name, business_type, address, submitted_by, verification_status, featured_status)
values ('22222222-0000-0000-0000-000000000001', 'Check Fixture Business', 'Product', '789 Test Ave, Pasig', (select id from pg_temp.demo_users where name = 'vendor1'), 'verified', 'listed');

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.business'));

insert into public.business_reviews (business_id, staff_id, action)
values ('22222222-0000-0000-0000-000000000001', (select id from pg_temp.demo_users where name = 'staff.business'), 'feature');
update public.businesses set featured_status = 'featured' where id = '22222222-0000-0000-0000-000000000001';

update public.businesses set featured_status = 'listed' where id = '22222222-0000-0000-0000-000000000001';

select pg_temp.as_owner();

do $$
declare
  v_featured int;
  v_unfeatured int;
  v_feature_review_rows int;
begin
  select count(*) into v_featured from public.activity_log where target_type = 'business' and target_id = '22222222-0000-0000-0000-000000000001' and action = 'featured';
  select count(*) into v_unfeatured from public.activity_log where target_type = 'business' and target_id = '22222222-0000-0000-0000-000000000001' and action = 'unfeatured';
  select count(*) into v_feature_review_rows from public.activity_log where target_type = 'business' and target_id = '22222222-0000-0000-0000-000000000001' and details -> 'notes' is not null and action not in ('featured', 'unfeatured');
  if v_featured <> 1 then
    raise exception 'Phase 2.7: expected 1 featured row from the businesses.featured_status flip, found %', v_featured;
  end if;
  if v_unfeatured <> 1 then
    raise exception 'Phase 2.7: expected 1 unfeatured row after flipping back, found %', v_unfeatured;
  end if;
  -- The insert into business_reviews with action='feature' must not itself
  -- log anything (log_review_activity's explicit skip branch).
  if (select count(*) from public.activity_log where actor_role is not null and target_type = 'business' and target_id = '22222222-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Phase 2.7: expected exactly 2 rows total for the fixture business (1 featured, 1 unfeatured), business_reviews'' own feature action must not add a third';
  end if;
end $$;

-- Discovery content review (log only, no status flip in this fixture):
-- one verified on discovery_content. Requires a route fixture first, since
-- discovery_content.route_id is not null.
select pg_temp.as_owner();

insert into public.routes (id, name, status)
values ('33333333-0000-0000-0000-000000000001', 'Check Fixture Trail', 'draft');

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));

insert into public.discovery_content (id, route_id, title, content, related_location_type, related_location_id, sequence_order, unlock_radius, status)
values ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'Check Fixture Secret', 'Some unlockable content.', 'place', '11111111-0000-0000-0000-000000000001', 1, 25, 'active');

insert into public.place_reviews (reviewed_type, reviewed_id, staff_id, action)
values ('discovery_content', '44444444-0000-0000-0000-000000000001', (select id from pg_temp.demo_users where name = 'staff.places'), 'verify');

select pg_temp.as_owner();

do $$
declare
  v_dc_verified int;
begin
  select count(*) into v_dc_verified from public.activity_log where target_type = 'discovery_content' and target_id = '44444444-0000-0000-0000-000000000001' and action = 'verified';
  if v_dc_verified <> 1 then
    raise exception 'Phase 2.7: expected 1 verified row on the discovery_content fixture, found %', v_dc_verified;
  end if;
end $$;

-- Trail stop reorder (offset pass, finalize pass): zero rows -- route_stops
-- only logs insert/delete, never update, so a pure sequence_order swap
-- (two update statements, one per moved stop, both hitting sequence_order
-- only) must add nothing.
-- route_stops write RLS needs build_trails or admin (never widened to
-- manage_places the way discovery_content was in 0013) -- staff.places
-- cannot write here, admin1 always qualifies via staff_role = 'admin'.
--
-- The stop inserts must run as a real actor, not owner: owner has no
-- auth.uid(), so write_activity() would (correctly) log nothing and there
-- would be nothing to compare the reorder against. Two inserts by the same
-- person on the same trail inside 60 seconds also merge into ONE updated
-- row (write_activity's merge window), not one per insert -- so the
-- expected count after adding two stops is 1.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'admin1'));

insert into public.route_stops (id, route_id, stop_type, stop_id, sequence_order)
values
  ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'place', '11111111-0000-0000-0000-000000000001', 1),
  ('55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 'place', '11111111-0000-0000-0000-000000000002', 2);

select pg_temp.as_owner();

do $$
declare
  v_after_insert int;
begin
  select count(*) into v_after_insert from public.activity_log where target_type = 'trail' and target_id = '33333333-0000-0000-0000-000000000001' and action = 'updated';
  if v_after_insert <> 1 then
    raise exception 'Phase 2.7: expected 1 updated row on the trail after adding 2 stops as one actor inside 60s (insert logs updated on the parent, the second merges), found %', v_after_insert;
  end if;
end $$;

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'admin1'));

-- Offset pass (avoid the unique(route_id, sequence_order) constraint), then finalize.
update public.route_stops set sequence_order = sequence_order + 100 where route_id = '33333333-0000-0000-0000-000000000001';
update public.route_stops set sequence_order = 3 - sequence_order + 100 where route_id = '33333333-0000-0000-0000-000000000001';

select pg_temp.as_owner();

do $$
declare
  v_after_reorder int;
begin
  select count(*) into v_after_reorder from public.activity_log where target_type = 'trail' and target_id = '33333333-0000-0000-0000-000000000001' and action = 'updated';
  if v_after_reorder <> 1 then
    raise exception 'Phase 2.7: expected still only the 1 updated row from adding stops after a pure sequence_order reorder (route_stops has no update trigger), found %', v_after_reorder;
  end if;
end $$;

-- Landing slide reorder: zero rows (sort_order is on the ignore list).
insert into public.landing_slides (id, image_url, caption, sort_order, active)
values
  ('66666666-0000-0000-0000-000000000001', 'https://example.test/a.jpg', 'Check Fixture Slide A', 0, true),
  ('66666666-0000-0000-0000-000000000002', 'https://example.test/b.jpg', 'Check Fixture Slide B', 1, true);

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'admin1'));
update public.landing_slides set sort_order = 1 where id = '66666666-0000-0000-0000-000000000001';
update public.landing_slides set sort_order = 0 where id = '66666666-0000-0000-0000-000000000002';
select pg_temp.as_owner();

do $$
declare
  v_slide_updates int;
begin
  select count(*) into v_slide_updates from public.activity_log where target_type = 'landing_slide' and action = 'updated';
  if v_slide_updates <> 0 then
    raise exception 'Phase 2.7: expected 0 updated rows from a pure sort_order reorder on landing_slides, found %', v_slide_updates;
  end if;
end $$;

-- Event publish: one published. Slide active off: one deactivated.
insert into public.events (id, title, posted_by, published)
values ('77777777-0000-0000-0000-000000000001', 'Check Fixture Event', (select id from pg_temp.demo_users where name = 'admin1'), false);

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'admin1'));
update public.events set published = true where id = '77777777-0000-0000-0000-000000000001';
update public.landing_slides set active = false where id = '66666666-0000-0000-0000-000000000001';
select pg_temp.as_owner();

do $$
declare
  v_published int;
  v_deactivated int;
begin
  select count(*) into v_published from public.activity_log where target_type = 'event' and target_id = '77777777-0000-0000-0000-000000000001' and action = 'published';
  select count(*) into v_deactivated from public.activity_log where target_type = 'landing_slide' and target_id = '66666666-0000-0000-0000-000000000001' and action = 'deactivated';
  if v_published <> 1 then
    raise exception 'Phase 2.7: expected 1 published row for the fixture event, found %', v_published;
  end if;
  if v_deactivated <> 1 then
    raise exception 'Phase 2.7: expected 1 deactivated row for the fixture slide, found %', v_deactivated;
  end if;
end $$;

-- admin1 changes a staff member's permissions: one permission_changed with
-- from and to. Avatar-only and theme-only profile updates: zero rows.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'admin1'));
update public.profiles set system_permission = array['manage_places', 'review_businesses']
  where id = (select id from pg_temp.demo_users where name = 'staff.business');
select pg_temp.as_owner();

do $$
declare
  v_perm_changed int;
  v_from jsonb;
  v_to jsonb;
begin
  select count(*) into v_perm_changed
  from public.activity_log
  where target_type = 'staff' and target_id = (select id from pg_temp.demo_users where name = 'staff.business') and action = 'permission_changed';
  if v_perm_changed <> 1 then
    raise exception 'Phase 2.7: expected 1 permission_changed row, found %', v_perm_changed;
  end if;

  -- max() is not defined for jsonb, so with exactly one row confirmed
  -- above, read its values directly.
  select details #> '{changed,system_permission,from}', details #> '{changed,system_permission,to}'
    into v_from, v_to
  from public.activity_log
  where target_type = 'staff' and target_id = (select id from pg_temp.demo_users where name = 'staff.business') and action = 'permission_changed';

  -- Exact arrays, not just "not null": #> returns jsonb, and a JSON null
  -- is not a SQL NULL, so an is-null test would pass a from/to that was
  -- silently blanked. staff.business is seeded with {review_businesses}.
  if v_from is distinct from '["review_businesses"]'::jsonb then
    raise exception 'Phase 2.7: expected permission_changed details.from to be ["review_businesses"], got %', v_from;
  end if;
  if v_to is distinct from '["manage_places", "review_businesses"]'::jsonb then
    raise exception 'Phase 2.7: expected permission_changed details.to to be ["manage_places","review_businesses"], got %', v_to;
  end if;
end $$;

-- Avatar-only and theme-only profile writes: zero rows. profiles' trigger
-- column list (staff_role, system_permission, active_status, position,
-- display_name, contact_number) doesn't include profile_picture,
-- theme_preference, or font_size_preference, so these updates never even
-- invoke log_activity.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.business'));
update public.profiles set profile_picture = 'https://example.test/avatar.png' where id = (select id from pg_temp.demo_users where name = 'staff.business');
update public.profiles set theme_preference = 'dark' where id = (select id from pg_temp.demo_users where name = 'staff.business');
select pg_temp.as_owner();

do $$
declare
  v_profile_rows int;
begin
  select count(*) into v_profile_rows from public.activity_log where target_type = 'staff' and target_id = (select id from pg_temp.demo_users where name = 'staff.business') and action not in ('permission_changed');
  if v_profile_rows <> 0 then
    raise exception 'Phase 2.7: expected 0 rows from avatar/theme-only profile updates, found %', v_profile_rows;
  end if;
end $$;

-- A vendor edits their own business: zero rows -- vendor1 has no
-- staff_role, so write_activity()'s actor lookup returns nothing.
-- Before/after count of the whole log, not a created_at filter: this file
-- runs inside one begin/rollback, and now() is frozen at the transaction's
-- start, so "created_at > now() - 1 minute" never advances and would
-- silently match everything or nothing depending on the fixture order.
create temp table pg_temp.vendor_edit_before as select count(*)::int as n from public.activity_log;

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'vendor1'));
update public.businesses set description = 'Vendor self-edit' where id = '22222222-0000-0000-0000-000000000001';
select pg_temp.as_owner();

do $$
declare
  v_before int := (select n from pg_temp.vendor_edit_before);
  v_after int := (select count(*) from public.activity_log);
begin
  if v_after <> v_before then
    raise exception 'Phase 2.7: expected 0 new rows from a vendor editing their own business, log grew by %', v_after - v_before;
  end if;
end $$;

-- log_auth_event: staff gets one row per call. Resident and inactive
-- staff get none. A bad p_action errors. anon is denied.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));
select public.log_auth_event('signed_in');
select public.log_auth_event('signed_out');

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'resident1'));
select public.log_auth_event('signed_in');

select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.events'));  -- inactive
select public.log_auth_event('signed_in');

select pg_temp.as_owner();

do $$
declare
  v_staff_auth_rows int;
  v_resident_auth_rows int;
  v_inactive_auth_rows int;
begin
  select count(*) into v_staff_auth_rows from public.activity_log where target_type = 'auth' and actor_id = (select id from pg_temp.demo_users where name = 'staff.places');
  select count(*) into v_resident_auth_rows from public.activity_log where target_type = 'auth' and actor_id = (select id from pg_temp.demo_users where name = 'resident1');
  select count(*) into v_inactive_auth_rows from public.activity_log where target_type = 'auth' and actor_id = (select id from pg_temp.demo_users where name = 'staff.events');
  if v_staff_auth_rows <> 2 then
    raise exception 'Phase 2.7: expected 2 auth rows for staff.places (signed_in, signed_out), found %', v_staff_auth_rows;
  end if;
  if v_resident_auth_rows <> 0 then
    raise exception 'Phase 2.7: expected 0 auth rows for resident1 (no staff_role), found %', v_resident_auth_rows;
  end if;
  if v_inactive_auth_rows <> 0 then
    raise exception 'Phase 2.7: expected 0 auth rows for staff.events (inactive), found %', v_inactive_auth_rows;
  end if;
end $$;

-- A bad p_action raises.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'staff.places'));
do $$
begin
  begin
    perform public.log_auth_event('logged_off');
    raise exception 'Phase 2.7: log_auth_event should have raised on an invalid p_action, did not';
  exception
    when others then
      if sqlerrm not like 'log_auth_event:%' then
        raise; -- unexpected error, surface it instead of swallowing it
      end if;
  end;
end $$;

-- anon is denied execute on log_auth_event entirely.
select pg_temp.as_anon();
do $$
begin
  begin
    perform public.log_auth_event('signed_in');
    raise exception 'Phase 2.7: anon should be denied execute on log_auth_event, was not';
  exception
    when insufficient_privilege then
      null; -- expected
  end;
end $$;

select pg_temp.as_owner();

rollback;
