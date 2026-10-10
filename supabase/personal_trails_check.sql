-- Runnable check for personal trails (0054). Not a migration, not part of
-- db:reset. Run by hand after db:reset:
--
--   docker exec -i supabase_db_lakbay-pasig psql -U postgres -v ON_ERROR_STOP=1 < supabase/personal_trails_check.sql
--
-- begin/rollback wraps the file, so nothing below leaves a trace. The first
-- failed assert stops the script. Fix and re-run, it is not a stop.
--
-- Covers: owner access, privacy from other users and staff, the pins that
-- stop a user trail from going official or public, no completion rows, entry
-- visibility through an owned trail, locations_with_entries (0055), the caps,
-- search, account deletion.

begin;

-- ---------------------------------------------------------------------------
-- Helpers (same stand-ins as activity_log_check.sql)
-- ---------------------------------------------------------------------------

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

-- Run a count query and compare.
create or replace function pg_temp.expect_count(p_sql text, p_expected bigint, p_label text) returns void as $$
declare
  v bigint;
begin
  execute p_sql into v;
  if v is distinct from p_expected then
    raise exception '%: expected %, got %', p_label, p_expected, v;
  end if;
end;
$$ language plpgsql;

-- Run a statement that must fail. p_like is matched against the error text,
-- so a typo in the statement cannot pass as a denial.
create or replace function pg_temp.expect_error(p_sql text, p_like text, p_label text) returns void as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_like then
      raise exception '%: expected error like "%", got "%"', p_label, p_like, sqlerrm;
    end if;
    return;
  end;
  raise exception '%: expected an error, got none', p_label;
end;
$$ language plpgsql;

-- Demo ids, from supabase/seed.sql.
create temp table pg_temp.ids (name text primary key, id uuid not null);
grant select on pg_temp.ids to public;
insert into pg_temp.ids (name, id) values
  ('admin1',    'f25e552f-e90c-4fc4-884e-02f46c40a47f'),  -- active admin
  ('resident1', 'ed8d4b57-6a77-418b-9db3-11c18e18fbca'),  -- resident
  ('vendor1',   'a77bf9f3-1107-4e9e-9677-ebbcaa662cba'),  -- resident that owns a business
  ('pub_trail', 'd4e40001-0001-4c1a-9c1a-000000000001'),  -- official, published
  ('place_a',   'a1e10001-0001-4c1a-9c1a-000000000001'),  -- stop in a published trail
  ('place_b',   'a1e10002-0002-4c1a-9c1a-000000000002'),  -- stop in a published trail
  ('place_c',   'a1e10005-0005-4c1a-9c1a-000000000005'),  -- in no trail, no entries in the seed
  ('mine',      '00000000-0000-4000-8000-0000000000a1');  -- the personal trail used below

-- A place entry for place_c. Today it is hidden: place_c is in no published trail.
select pg_temp.as_owner();
insert into public.discovery_content (title, content, related_location_type, related_location_id, sequence_order, unlock_radius)
select 'Check entry', 'Check entry text', 'place', id, 1, 25 from pg_temp.ids where name = 'place_c';

-- Entries anon can read today. Compared again after a personal trail exists.
select pg_temp.as_anon();
select set_config('check.anon_entries', (select count(*) from public.discovery_content)::text, true);

-- ---------------------------------------------------------------------------
-- 1. Owner can build and read a personal trail
-- ---------------------------------------------------------------------------
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));

insert into public.routes (id, name, personal, created_by)
select m.id, 'Zzyx walk', true, r.id
from pg_temp.ids m, pg_temp.ids r where m.name = 'mine' and r.name = 'resident1';

insert into public.route_stops (route_id, stop_type, stop_id, sequence_order)
select m.id, 'place', a.id, 1 from pg_temp.ids m, pg_temp.ids a where m.name = 'mine' and a.name = 'place_a';
insert into public.route_stops (route_id, stop_type, stop_id, sequence_order)
select m.id, 'place', c.id, 2 from pg_temp.ids m, pg_temp.ids c where m.name = 'mine' and c.name = 'place_c';

select pg_temp.expect_count($$select count(*) from public.routes where id = '00000000-0000-4000-8000-0000000000a1'$$, 1, '1.1 owner reads own trail');
select pg_temp.expect_count($$select count(*) from public.route_stops where route_id = '00000000-0000-4000-8000-0000000000a1'$$, 2, '1.2 owner reads own stops');

-- ---------------------------------------------------------------------------
-- 2. Nobody else sees it: other user, staff, anon
-- ---------------------------------------------------------------------------
select pg_temp.as_user((select id from pg_temp.ids where name = 'vendor1'));
select pg_temp.expect_count($$select count(*) from public.routes where personal$$, 0, '2.1 other user sees no personal trail');
select pg_temp.expect_count($$select count(*) from public.route_stops where route_id = '00000000-0000-4000-8000-0000000000a1'$$, 0, '2.2 other user sees no personal stops');

select pg_temp.as_user((select id from pg_temp.ids where name = 'admin1'));
select pg_temp.expect_count($$select count(*) from public.routes where personal$$, 0, '2.3 admin sees no personal trail');
select pg_temp.expect_count($$select count(*) from public.route_stops where route_id = '00000000-0000-4000-8000-0000000000a1'$$, 0, '2.4 admin sees no personal stops');
select pg_temp.expect_count($$with u as (update public.routes set name = 'x' where id = '00000000-0000-4000-8000-0000000000a1' returning 1) select count(*) from u$$, 0, '2.5 admin cannot update it');
select pg_temp.expect_count($$with d as (delete from public.routes where id = '00000000-0000-4000-8000-0000000000a1' returning 1) select count(*) from d$$, 0, '2.6 admin cannot delete it');
select pg_temp.expect_count($$select count(*) from public.routes where not personal$$, 2, '2.7 admin still sees every official trail');

select pg_temp.as_anon();
select pg_temp.expect_count($$select count(*) from public.routes where personal$$, 0, '2.8 anon sees no personal trail');
select pg_temp.expect_count($$select count(*) from public.routes$$, 2, '2.9 anon still sees the 2 published trails');
select pg_temp.expect_count($$select count(*) from public.route_stops$$, 9, '2.10 anon still sees the 9 official stops');

select pg_temp.as_owner();
select pg_temp.expect_count($$select count(*) from public.routes where id = '00000000-0000-4000-8000-0000000000a1'$$, 1, '2.11 trail survived the staff attempts');

-- ---------------------------------------------------------------------------
-- 3. Pins: a user trail cannot turn official, public, or someone else's
-- ---------------------------------------------------------------------------
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));

select pg_temp.expect_error($$insert into public.routes (name, personal, created_by) values ('Fake official', false, 'ed8d4b57-6a77-418b-9db3-11c18e18fbca')$$, '%row-level security%', '3.1 user cannot insert an official trail');
select pg_temp.expect_error($$insert into public.routes (name, personal, created_by) values ('Spoof', true, 'a77bf9f3-1107-4e9e-9677-ebbcaa662cba')$$, '%row-level security%', '3.2 user cannot own a trail as someone else');
select pg_temp.expect_error($$insert into public.routes (name, personal, status, created_by) values ('Public', true, 'published', 'ed8d4b57-6a77-418b-9db3-11c18e18fbca')$$, '%routes_personal_draft_owned%', '3.3 personal trail cannot be published on insert');
select pg_temp.expect_error($$update public.routes set status = 'published' where id = '00000000-0000-4000-8000-0000000000a1'$$, '%routes_personal_draft_owned%', '3.4 personal trail cannot be published on update');
select pg_temp.expect_error($$update public.routes set personal = false where id = '00000000-0000-4000-8000-0000000000a1'$$, '%row-level security%', '3.5 user cannot flip a trail to official');
select pg_temp.expect_error($$insert into public.route_stops (route_id, stop_type, stop_id, sequence_order) values ('d4e40001-0001-4c1a-9c1a-000000000001', 'place', 'a1e10001-0001-4c1a-9c1a-000000000001', 99)$$, '%row-level security%', '3.6 user cannot add a stop to an official trail');

select pg_temp.as_user((select id from pg_temp.ids where name = 'vendor1'));
select pg_temp.expect_error($$insert into public.route_stops (route_id, stop_type, stop_id, sequence_order) values ('00000000-0000-4000-8000-0000000000a1', 'place', 'a1e10002-0002-4c1a-9c1a-000000000002', 3)$$, '%row-level security%', '3.7 user cannot add a stop to another user trail');

-- ---------------------------------------------------------------------------
-- 4. No completion row for a personal trail
-- ---------------------------------------------------------------------------
select pg_temp.expect_error($$insert into public.completed_routes (user_id, route_id) values ('a77bf9f3-1107-4e9e-9677-ebbcaa662cba', '00000000-0000-4000-8000-0000000000a1')$$, '%row-level security%', '4.1 cannot complete another user personal trail');

select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));
select pg_temp.expect_error($$insert into public.completed_routes (user_id, route_id) values ('ed8d4b57-6a77-418b-9db3-11c18e18fbca', '00000000-0000-4000-8000-0000000000a1')$$, '%row-level security%', '4.2 owner cannot complete own personal trail');
select pg_temp.expect_error($$insert into public.completed_routes (user_id, route_id) values ('ed8d4b57-6a77-418b-9db3-11c18e18fbca', gen_random_uuid())$$, '%row-level security%', '4.3 cannot complete a made-up route');

insert into public.completed_routes (user_id, route_id)
select r.id, t.id from pg_temp.ids r, pg_temp.ids t where r.name = 'resident1' and t.name = 'pub_trail';
select pg_temp.expect_count($$select count(*) from public.completed_routes where user_id = 'ed8d4b57-6a77-418b-9db3-11c18e18fbca'$$, 1, '4.4 official completion still works');

-- The row from 4.4 exists now, so an update has something to change. Without
-- the update policy, a user could insert an official completion and then
-- point it at their own personal trail.
select pg_temp.expect_error($$update public.completed_routes set route_id = '00000000-0000-4000-8000-0000000000a1' where user_id = 'ed8d4b57-6a77-418b-9db3-11c18e18fbca'$$, '%row-level security%', '4.5 cannot point a completion at a personal trail');
select pg_temp.expect_count($$select count(*) from public.completed_routes where route_id = '00000000-0000-4000-8000-0000000000a1'$$, 0, '4.6 no completion row exists for the personal trail');

-- ---------------------------------------------------------------------------
-- 5. Entries: visible through an owned trail, nowhere else
-- ---------------------------------------------------------------------------
select pg_temp.expect_count($$select count(*) from public.discovery_content where title = 'Check entry'$$, 1, '5.1 owner sees the entry for a place on their trail');

select pg_temp.as_user((select id from pg_temp.ids where name = 'vendor1'));
select pg_temp.expect_count($$select count(*) from public.discovery_content where title = 'Check entry'$$, 0, '5.2 other user does not');

select pg_temp.as_anon();
select pg_temp.expect_count($$select count(*) from public.discovery_content where title = 'Check entry'$$, 0, '5.3 anon does not');
select pg_temp.expect_count('select count(*) from public.discovery_content', current_setting('check.anon_entries')::bigint, '5.4 anon entry count unchanged by a personal trail');

select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));
delete from public.route_stops where route_id = '00000000-0000-4000-8000-0000000000a1' and sequence_order = 2;
select pg_temp.expect_count($$select count(*) from public.discovery_content where title = 'Check entry'$$, 0, '5.5 entry hides again once the stop is gone');

-- locations_with_entries (0055): ids only, so the builder can mark places that
-- hold a secret. place_c's entry is hidden from the user right now (5.5), yet
-- the function still reports it.
select pg_temp.expect_count($$select count(*) from public.locations_with_entries() where location_type = 'place' and location_id = 'a1e10005-0005-4c1a-9c1a-000000000005'$$, 1, '5.6 signed in user learns place_c has an entry');
select pg_temp.expect_count($$select count(*) from public.discovery_content where title = 'Check entry'$$, 0, '5.7 learning that does not reveal the entry itself');

select pg_temp.as_anon();
select pg_temp.expect_error($$select * from public.locations_with_entries()$$, '%permission denied%', '5.8 anon cannot call it');

select pg_temp.as_owner();
update public.discovery_content set status = 'inactive' where title = 'Check entry';
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));
select pg_temp.expect_count($$select count(*) from public.locations_with_entries() where location_id = 'a1e10005-0005-4c1a-9c1a-000000000005'$$, 0, '5.9 an inactive entry does not count');

select pg_temp.as_owner();
update public.discovery_content set status = 'active' where title = 'Check entry';
update public.places set verification_status = 'pending' where id = 'a1e10005-0005-4c1a-9c1a-000000000005';
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));
select pg_temp.expect_count($$select count(*) from public.locations_with_entries() where location_id = 'a1e10005-0005-4c1a-9c1a-000000000005'$$, 0, '5.10 an unverified place is not listed');

select pg_temp.as_owner();
update public.places set verification_status = 'verified' where id = 'a1e10005-0005-4c1a-9c1a-000000000005';

-- 5b. A flagged entry stays hidden through a personal trail (0056, 0053). A
-- business entry is flagged when it is written. Verify clears it, any change to
-- its text flags it again, and a direct write cannot clear it.
insert into pg_temp.ids (name, id)
select 'biz_a', id from public.businesses where verification_status in ('verified', 'pending') order by id limit 1;
insert into public.discovery_content (title, content, related_location_type, related_location_id, sequence_order, unlock_radius)
select 'Check biz entry', 'Check biz entry text', 'business', id, 1, 25 from pg_temp.ids where name = 'biz_a';

select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));
insert into public.route_stops (route_id, stop_type, stop_id, sequence_order)
select '00000000-0000-4000-8000-0000000000a1', 'business', id, 90 from pg_temp.ids where name = 'biz_a';
select pg_temp.expect_count($$select count(*) from public.discovery_content where title = 'Check biz entry'$$, 0, '5.11 a flagged business entry is hidden through an owned trail');
select pg_temp.expect_count($$select count(*) from public.locations_with_entries() where location_id = (select id from pg_temp.ids where name = 'biz_a')$$, 0, '5.12 a flagged entry does not mark its business');

select pg_temp.as_user((select id from pg_temp.ids where name = 'admin1'));
insert into public.place_reviews (reviewed_type, reviewed_id, staff_id, action)
select 'discovery_content', id, 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'verify' from public.discovery_content where title = 'Check biz entry';
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));
select pg_temp.expect_count($$select count(*) from public.discovery_content where title = 'Check biz entry'$$, 1, '5.13 Verify clears the flag, so the entry shows through the owned trail');
select pg_temp.expect_count($$select count(*) from public.locations_with_entries() where location_id = (select id from pg_temp.ids where name = 'biz_a')$$, 1, '5.14 and its business is marked');

select pg_temp.as_user((select id from pg_temp.ids where name = 'admin1'));
update public.discovery_content set content = 'Changed text' where title = 'Check biz entry';
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));
select pg_temp.expect_count($$select count(*) from public.discovery_content where title = 'Check biz entry'$$, 0, '5.15 changing the text flags it again');

select pg_temp.as_user((select id from pg_temp.ids where name = 'admin1'));
update public.discovery_content set needs_place_review = false where title = 'Check biz entry';
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));
select pg_temp.expect_count($$select count(*) from public.discovery_content where title = 'Check biz entry'$$, 0, '5.16 a direct write cannot clear the flag');

delete from public.route_stops where route_id = '00000000-0000-4000-8000-0000000000a1' and sequence_order = 90;
select pg_temp.as_owner();
delete from public.discovery_content where title = 'Check biz entry';
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));

-- ---------------------------------------------------------------------------
-- 6. Search finds your own trail, not anyone else's
-- ---------------------------------------------------------------------------
select pg_temp.expect_count($$select count(*) from public.search_trails('Zzyx')$$, 1, '6.1 owner finds own trail');
select pg_temp.as_user((select id from pg_temp.ids where name = 'vendor1'));
select pg_temp.expect_count($$select count(*) from public.search_trails('Zzyx')$$, 0, '6.2 other user does not');

-- ---------------------------------------------------------------------------
-- 7. Caps: 10 trails per user, 12 stops per trail
-- ---------------------------------------------------------------------------
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));

-- 'mine' plus 9 more makes 10.
insert into public.routes (name, personal, created_by)
select 'Extra ' || g, true, 'ed8d4b57-6a77-418b-9db3-11c18e18fbca' from generate_series(1, 9) g;
select pg_temp.expect_count($$select count(*) from public.routes where personal$$, 10, '7.1 ten trails allowed');
select pg_temp.expect_error($$insert into public.routes (name, personal, created_by) values ('Eleven', true, 'ed8d4b57-6a77-418b-9db3-11c18e18fbca')$$, 'personal_trail_limit', '7.2 eleventh trail refused');
select pg_temp.expect_count($$with u as (update public.routes set name = 'Renamed' where id = '00000000-0000-4000-8000-0000000000a1' returning 1) select count(*) from u$$, 1, '7.3 a trail at the cap can still be edited');

-- 'mine' has 1 stop now; fill to 12.
insert into public.route_stops (route_id, stop_type, stop_id, sequence_order)
select '00000000-0000-4000-8000-0000000000a1', 'place', gen_random_uuid(), 1 + g from generate_series(1, 11) g;
select pg_temp.expect_count($$select count(*) from public.route_stops where route_id = '00000000-0000-4000-8000-0000000000a1'$$, 12, '7.4 twelve stops allowed');
select pg_temp.expect_error($$insert into public.route_stops (route_id, stop_type, stop_id, sequence_order) values ('00000000-0000-4000-8000-0000000000a1', 'place', gen_random_uuid(), 99)$$, 'personal_stop_limit', '7.5 thirteenth stop refused');
select pg_temp.expect_count($$with u as (update public.route_stops set sequence_order = sequence_order + 100 where route_id = '00000000-0000-4000-8000-0000000000a1' returning 1) select count(*) from u$$, 12, '7.6 stops at the cap can still be reordered');

-- Moving a stop between the user's own trails counts against the target.
insert into public.route_stops (route_id, stop_type, stop_id, sequence_order)
select id, 'place', gen_random_uuid(), 1 from public.routes where name = 'Extra 1';
select pg_temp.expect_error($$update public.route_stops set route_id = '00000000-0000-4000-8000-0000000000a1', sequence_order = 200 where route_id = (select id from public.routes where name = 'Extra 1')$$, 'personal_stop_limit', '7.6a a stop cannot be moved into a full trail');
select pg_temp.expect_count($$with u as (update public.route_stops set route_id = (select id from public.routes where name = 'Extra 2') where route_id = (select id from public.routes where name = 'Extra 1') returning 1) select count(*) from u$$, 1, '7.6b a stop can be moved into a trail with room');
select pg_temp.expect_count($$with u as (update public.route_stops set route_id = route_id where route_id = '00000000-0000-4000-8000-0000000000a1' returning 1) select count(*) from u$$, 12, '7.6c rewriting route_id to the same trail at the cap is not counted');

select pg_temp.as_user((select id from pg_temp.ids where name = 'vendor1'));
insert into public.routes (name, personal, created_by) values ('Vendor trail', true, 'a77bf9f3-1107-4e9e-9677-ebbcaa662cba');
select pg_temp.expect_count($$select count(*) from public.routes where personal$$, 1, '7.7 one user at the cap does not limit another');

-- Staff building an official trail is not capped or flagged.
select pg_temp.as_user((select id from pg_temp.ids where name = 'admin1'));
insert into public.routes (name, created_by) values ('Official draft', 'f25e552f-e90c-4fc4-884e-02f46c40a47f');
select pg_temp.expect_count($$select count(*) from public.routes where name = 'Official draft' and not personal$$, 1, '7.8 staff official trail unaffected');

-- ---------------------------------------------------------------------------
-- 8. Deleting an account removes its personal trails
-- ---------------------------------------------------------------------------
select pg_temp.as_user((select id from pg_temp.ids where name = 'resident1'));
select public.delete_my_account();

select pg_temp.as_owner();
select pg_temp.expect_count($$select count(*) from public.routes where created_by = 'ed8d4b57-6a77-418b-9db3-11c18e18fbca'$$, 0, '8.1 personal trails gone with the account');
select pg_temp.expect_count($$select count(*) from public.route_stops where route_id = '00000000-0000-4000-8000-0000000000a1'$$, 0, '8.2 their stops gone too');
select pg_temp.expect_count($$select count(*) from public.profiles where id = 'ed8d4b57-6a77-418b-9db3-11c18e18fbca'$$, 0, '8.3 profile gone');
select pg_temp.expect_count($$select count(*) from public.routes where not personal and status = 'published'$$, 2, '8.4 official trails untouched');

select 'personal_trails_check: all asserts passed' as result;

rollback;
