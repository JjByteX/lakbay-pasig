-- Runnable check for recommend_items and its tables (0046). Not a migration,
-- not part of db:reset. Run by hand after every db:reset while 0046 is being
-- built, and again after any change to the constants in its declare block:
--
--   docker exec -i supabase_db_lakbay-pasig psql -U postgres -v ON_ERROR_STOP=1 < supabase/recommend_check.sql
--
-- (container name follows supabase/config.toml's project_id, "lakbay-pasig".)
--
-- Two transactions, both ending in rollback, so nothing below leaves a trace
-- and the file is safe to run against the seeded local database any number of
-- times. ON_ERROR_STOP=1 means the first failed assert stops the script, a
-- failed check gets fixed and re-run, it is not a stop.
--
--   Part 1  fixtures and every assert (recommendation-phases.md 2.4 to 2.28).
--           Prints a few "notice" lines with the spread numbers, useful when
--           tuning the constants.
--   Part 2  prints the top 5 for 10 sample pins as anon (2.29), for the CATO
--           review. It inserts nothing, so it reads whatever content is in the
--           database when it runs.
--
-- Fixtures are named "TEST ..." and use synthetic 384 dimension vectors built
-- from a few basis directions, so this check never needs the embedding model.
-- The seeded Places and Businesses are real CATO content (decision-log.md
-- entry #17). Part 1 flips them to rejected / unverified inside its own
-- transaction so only fixtures can be recommended, and rollback puts them back.
--
-- Fixture layout:
--   Main cluster, around the pin 14.5764, 121.0851 (inside Pasig): 10 places
--   and about 40 businesses, all within 2 km of the pin. Used for fairness,
--   rotation and spread.
--   Taste cluster, at 14.9, 121.4: far outside the main cluster's 0.2 degree
--   box, so a pin there sees only these items. Four basis directions (A to D)
--   plus one item with no embedding, used for taste, preferences and anchor.
--   Eligibility items sit in the main cluster and each test shrinks the world
--   to a few named items inside a savepoint, so assertions compare whole sets.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Same as_user / as_owner / as_anon as activity_log_check.sql. as_user sets
-- the session to `authenticated` and fills request.jwt.claims with the demo
-- user's id, the two settings PostgREST sets per request in production.

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

-- Demo account ids, from supabase/seed.sql.
create temp table pg_temp.demo_users (name text primary key, id uuid not null);
insert into pg_temp.demo_users (name, id) values
  ('admin1',        'f25e552f-e90c-4fc4-884e-02f46c40a47f'),  -- staff_role admin, active
  ('staff.places',  '6456adca-58a3-48c3-b0e6-6a086d03734f'),  -- staff, manage_places, active
  ('staff.business','fed52550-3ee1-48da-b033-211f6245fbb6'),  -- staff, review_businesses, active
  ('resident1',     'ed8d4b57-6a77-418b-9db3-11c18e18fbca'),  -- resident, no business
  ('resident2',     '75486d5a-d222-4853-8046-8a55199c6208'),  -- resident, no business
  ('vendor1',       'a77bf9f3-1107-4e9e-9677-ebbcaa662cba');  -- resident + owns a business
-- Asserts below read this table while switched to anon or authenticated.
grant select on pg_temp.demo_users to public;

create or replace function pg_temp.assert(ok boolean, msg text) returns void as $$
begin
  if ok is not true then
    raise exception 'FAILED: %', msg;
  end if;
end;
$$ language plpgsql;

-- A 384 dimension vector pointing mostly along one axis. Two items on the same
-- axis have cosine 1, items on different axes have the same low cosine.
create or replace function pg_temp.vec(d int) returns extensions.vector as $$
  select (array_cat(array_fill(0.02::real, array[d - 1]),
          array_cat(array[1::real], array_fill(0.02::real, array[384 - d]))))::extensions.vector
$$ language sql immutable;

-- recommend_items as a given caller ('anon' or a demo user name), with names
-- joined on afterwards (as owner, after the role is reset). p_ts pins the
-- clock through the app.rec_now hook, null leaves whatever is set.
create or replace function pg_temp.rec(
  p_who text, p_lat double precision, p_lng double precision, p_lim int default 30,
  p_ak text default null, p_aid uuid default null, p_ts text default null
) returns table (pos int, kind text, id uuid, name text, reason text, km double precision)
language plpgsql as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_res jsonb;
begin
  if p_ts is not null then perform set_config('app.rec_now', p_ts, true); end if;
  if p_who <> 'anon' then
    select d.id into v_uid from pg_temp.demo_users d where d.name = p_who;
  end if;
  if p_who = 'anon' then perform pg_temp.as_anon(); else perform pg_temp.as_user(v_uid); end if;
  select coalesce(jsonb_agg(jsonb_build_object('pos', r.n, 'kind', r.kind, 'id', r.id,
                                               'reason', r.reason, 'km', r.distance_km) order by r.n), '[]')
    into v_res
    from public.recommend_items(p_lat, p_lng, p_lim, p_ak, p_aid) with ordinality as r(kind, id, reason, distance_km, n);
  perform pg_temp.as_owner();
  return query
    select x.pos, x.kind, x.id, coalesce(pl.name, b.name), x.reason, x.km
    from jsonb_to_recordset(v_res) as x(pos int, kind text, id uuid, reason text, km double precision)
    left join public.places pl on x.kind = 'place' and pl.id = x.id
    left join public.businesses b on x.kind = 'business' and b.id = x.id
    order by x.pos;
end;
$$;

-- Sorted names a call returns, for whole-set comparisons.
create or replace function pg_temp.names(
  p_who text, p_lat double precision, p_lng double precision,
  p_ak text default null, p_aid uuid default null
) returns text[] language sql as $$
  select coalesce(array_agg(r.name order by r.name), '{}')
  from pg_temp.rec(p_who, p_lat, p_lng, 30, p_ak, p_aid) r
$$;

-- One line fingerprint of a call, for before/after comparisons.
create or replace function pg_temp.snap(p_who text, p_lat double precision, p_lng double precision, p_lim int default 30)
returns text language sql as $$
  select coalesce(string_agg(r.name || '|' || coalesce(r.reason, '') || '|' || coalesce(round(r.km::numeric, 4)::text, ''),
                             ';' order by r.pos), '')
  from pg_temp.rec(p_who, p_lat, p_lng, p_lim) r
$$;

-- Position of a named item in a call, null when it is not returned.
create or replace function pg_temp.pos_of(p_who text, p_lat double precision, p_lng double precision, p_name text)
returns int language sql as $$
  select r.pos from pg_temp.rec(p_who, p_lat, p_lng, 30) r where r.name = p_name
$$;

-- Shrinks the world to the named items: every other place becomes rejected and
-- every other business unverified. Call it inside a savepoint and roll back.
create or replace function pg_temp.only(keep text[]) returns void as $$
  update public.places set verification_status = 'rejected' where name <> all (keep);
  update public.businesses set verification_status = 'unverified' where name <> all (keep);
$$ language sql;

-- Whether a caller can read a named row of a table, through the real policies.
create or replace function pg_temp.can_read(p_who text, p_table text, p_name text) returns boolean as $$
declare
  v_uid uuid;
  v_ok boolean;
begin
  if p_who <> 'anon' then select d.id into v_uid from pg_temp.demo_users d where d.name = p_who; end if;
  if p_who = 'anon' then perform pg_temp.as_anon(); else perform pg_temp.as_user(v_uid); end if;
  execute format('select exists (select 1 from public.%I where name = %L)', p_table, p_name) into v_ok;
  perform pg_temp.as_owner();
  return v_ok;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select pg_temp.as_owner();

-- Seeded content out of the way (rolled back with everything else).
update public.places set verification_status = 'rejected';
update public.businesses set verification_status = 'unverified';

-- Five business categories, plus one used only for the preferred category test.
insert into public.business_categories (name, icon, sort_order) values
  ('TEST Food', 'utensils', 901), ('TEST Shop', 'store', 902), ('TEST Craft', 'hammer', 903),
  ('TEST Service', 'wrench', 904), ('TEST Other', 'package', 905), ('TEST Pref Cat', 'star', 906);

-- Main cluster, places: 10 verified, spread over the five place categories.
-- Offsets are in steps of 0.0018 degrees (about 200 m), at most 7 steps, so
-- every item is within about 2 km of the pin.
insert into public.places (name, category_id, address, latitude, longitude, verification_status)
select 'TEST Place ' || lpad(i::text, 2, '0'),
       (select id from public.place_categories order by sort_order offset ((i - 1) % 5) limit 1),
       'TEST', 14.5764 + (((i * 7) % 15) - 7) * 0.0018, 121.0851 + (((i * 11) % 15) - 7) * 0.0018, 'verified'
from generate_series(1, 10) i;

-- Places that must never appear: pending, rejected, and one marked closed.
insert into public.places (name, category_id, address, latitude, longitude, verification_status, operating_hours)
select n, (select id from public.place_categories order by sort_order limit 1), 'TEST', 14.5764, 121.0851, st, hrs
from (values
  ('TEST Place Pending',  'pending',  null),
  ('TEST Place Rejected', 'rejected', null),
  ('TEST Place Closed',   'verified', '{"v":1,"mode":"temp_closed","days":{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}')
) as t(n, st, hrs);

-- Main cluster, businesses: 30, mixed verified / pending, registered / informal
-- / unset, thin and detailed descriptions, five categories. Every sixth one is
-- open 24 hours every day, the rest have no hours (unknown).
insert into public.businesses (name, business_type, address, latitude, longitude, submitted_by,
                               verification_status, registered_or_informal, category_id, description, opening_hours)
select 'TEST Biz ' || lpad(i::text, 2, '0'), 'Product', 'TEST',
       14.5764 + ((((i * 7) + 3) % 15) - 7) * 0.0018, 121.0851 + ((((i * 11) + 5) % 15) - 7) * 0.0018,
       (select id from pg_temp.demo_users where name = 'vendor1'),
       case when i % 3 = 0 then 'verified' else 'pending' end,
       case when i % 5 = 0 then null when i % 2 = 0 then 'registered' else 'informal' end,
       (select id from public.business_categories where name = (array['TEST Food', 'TEST Shop', 'TEST Craft', 'TEST Service', 'TEST Other'])[(i % 5) + 1]),
       case when i % 2 = 0 then 'A longer description of this fixture business. It sells things, tells its story, and lists what makes it different from the stall next door, in a few full sentences.' else 'Stall.' end,
       case when i % 6 = 0 then '{"v":1,"mode":"main","days":{"mon":[["00:00","24:00"]],"tue":[["00:00","24:00"]],"wed":[["00:00","24:00"]],"thu":[["00:00","24:00"]],"fri":[["00:00","24:00"]],"sat":[["00:00","24:00"]],"sun":[["00:00","24:00"]]}}' end
from generate_series(1, 30) i;

-- Four pairs of a thin listing (one word) and a detailed one (a long story),
-- each pair in one category, at one spot (about 1 km north of the pin) and with
-- one vector. A pair ties on every input, so thin and detailed must rotate
-- alike. Four pairs, not one, so a single unlucky hash cannot decide the check.
insert into public.businesses (name, business_type, address, latitude, longitude, submitted_by,
                               verification_status, category_id, description)
select t.kind || ' ' || k, 'Product', 'TEST', 14.5854 + (k - 2) * 0.0009, 121.0851, (select id from pg_temp.demo_users where name = 'vendor1'),
       'pending', (select id from public.business_categories where name = (array['TEST Food', 'TEST Shop', 'TEST Craft', 'TEST Service'])[k]),
       case t.kind when 'TEST Thin' then 'Bakery'
         else 'A neighbourhood bakery that has baked pandesal and ensaymada in the same oven since the nineties, run by two sisters, with a long story about the barangay, the fiesta orders and the regular customers who come before sunrise.' end
from (values ('TEST Thin'), ('TEST Detailed')) as t(kind), generate_series(1, 4) k;

-- Eligibility specials, all near the pin. Legacy and broken hours must stay
-- eligible (unknown), the closed ones and the unverified one must never show,
-- the no-pin one shows only when location is unusable. Legacy and no-category
-- rows keep category_id null, so they also exercise the category_text_legacy
-- fallback and the cap's coalesce.
insert into public.businesses (name, business_type, address, latitude, longitude, submitted_by,
                               verification_status, category_text_legacy, opening_hours)
select n, 'Product', 'TEST', la, lo, (select id from pg_temp.demo_users where name = 'vendor1'), st, 'Legacy text', hrs
from (values
  ('TEST Unverified biz', 14.5764, 121.0851, 'unverified', null),
  ('TEST Closed temp',    14.5764, 121.0851, 'pending', '{"v":1,"mode":"temp_closed","days":{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}'),
  ('TEST Closed perm',    14.5764, 121.0851, 'verified', '{"v":1,"mode":"perm_closed","days":{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}'),
  ('TEST Legacy hours',   14.5764, 121.0851, 'pending', 'Tuesday to Sunday, 9:00 AM – 4:00 PM'),
  ('TEST Broken hours',   14.5764, 121.0851, 'pending', '{"v":1,"mode":"main","days":{"mon":[["9:00","x"]]}}'),
  ('TEST NoPin biz',      null::double precision, null::double precision, 'pending', null)
) as t(n, la, lo, st, hrs);

-- Taste cluster, all at exactly 14.9, 121.4. Places in four different place
-- categories, businesses in different categories. A and A are one direction,
-- QBp is a copy of QB in the preferred category, QNoEmb has no vector.
insert into public.places (name, category_id, address, latitude, longitude, verification_status)
select n, (select id from public.place_categories order by sort_order offset o limit 1), 'TEST', 14.9, 121.4, 'verified'
from (values ('TEST Q Place A1', 0), ('TEST Q Place A2', 1), ('TEST Q Place B1', 2), ('TEST Q Place C1', 3)) as t(n, o);

insert into public.businesses (name, business_type, address, latitude, longitude, submitted_by, verification_status, category_id)
select n, 'Product', 'TEST', 14.9, 121.4, (select id from pg_temp.demo_users where name = 'vendor1'), 'pending',
       (select id from public.business_categories where name = c)
from (values
  ('TEST Q Biz A', 'TEST Food'), ('TEST Q Biz B', 'TEST Shop'), ('TEST Q Biz C', 'TEST Craft'),
  ('TEST Q Biz D', 'TEST Service'), ('TEST Q Biz NoEmb', 'TEST Other'), ('TEST Q Biz Bp', 'TEST Pref Cat')
) as t(n, c);

-- Fixed ids (a hash of the name), so every run sees the same fixtures and the
-- daily rotation hash, which includes the id, gives the same rows. Nothing
-- references these rows yet, the vectors and everything else come after.
update public.places set id = md5(name)::uuid where name like 'TEST%';
update public.businesses set id = md5(name)::uuid where name like 'TEST%';

-- Vectors for the main cluster: four directions in turn. Taste is off for
-- most main cluster calls, so these only matter when a test turns taste on.
insert into public.item_embeddings (kind, item_id, model, content_hash, embedding)
select 'place', x.id, 'TEST', 'x', pg_temp.vec((((x.n - 1) % 4) + 1)::int)
from (select id, row_number() over (order by name) n from public.places where name like 'TEST Place%') x;  -- not 'TEST Q Place', that is the taste cluster
insert into public.item_embeddings (kind, item_id, model, content_hash, embedding)
select 'business', x.id, 'TEST', 'x', pg_temp.vec((((x.n - 1) % 4) + 1)::int)
from (select id, row_number() over (order by name) n from public.businesses where name like 'TEST%' and name not like 'TEST Q %') x;

insert into public.item_embeddings (kind, item_id, model, content_hash, embedding)
select 'place', pl.id, 'TEST', 'x', pg_temp.vec(d)
from (values ('TEST Q Place A1', 1), ('TEST Q Place A2', 1), ('TEST Q Place B1', 2), ('TEST Q Place C1', 3)) t(n, d)
join public.places pl on pl.name = t.n;
insert into public.item_embeddings (kind, item_id, model, content_hash, embedding)
select 'business', b.id, 'TEST', 'x', pg_temp.vec(d)
from (values ('TEST Q Biz A', 1), ('TEST Q Biz B', 2), ('TEST Q Biz C', 3), ('TEST Q Biz D', 4), ('TEST Q Biz Bp', 2)) t(n, d)
join public.businesses b on b.name = t.n;

-- Sanity: the fixtures landed.
select pg_temp.assert((select count(*) from public.places where name like 'TEST Place __') = 10, 'fixture: 10 places');
select pg_temp.assert((select count(*) from public.businesses where name like 'TEST Biz __') = 30, 'fixture: 30 businesses');
select pg_temp.assert((select count(*) from public.item_embeddings where model = 'TEST') > 50, 'fixture: embeddings');

-- ---------------------------------------------------------------------------
-- Eligibility (2.4 to 2.9)
-- ---------------------------------------------------------------------------
-- The world shrinks to the named items. Expected sets are whole, so an item
-- that should not appear and an item that should both fail loudly.
savepoint eligibility;
select pg_temp.only(array[
  'TEST Place 01', 'TEST Place Pending', 'TEST Place Rejected', 'TEST Place Closed',
  'TEST Biz 01', 'TEST Biz 03', 'TEST Unverified biz', 'TEST Closed temp', 'TEST Closed perm',
  'TEST Legacy hours', 'TEST Broken hours', 'TEST NoPin biz']);

-- 2.5, 2.6, 2.7 as anon with a usable pin. Pending and rejected places, the
-- unverified business, closed items and the no-pin item are out. Legacy text
-- hours and broken JSON hours stay in, with no error.
select pg_temp.assert(
  pg_temp.names('anon', 14.5764, 121.0851) =
    array['TEST Biz 01', 'TEST Biz 03', 'TEST Broken hours', 'TEST Legacy hours', 'TEST Place 01'],
  '2.5/2.6/2.7: anon with a pin sees exactly Place 01, Biz 01, Biz 03, Legacy hours, Broken hours, got '
    || pg_temp.names('anon', 14.5764, 121.0851)::text);

-- 2.7 No location: the no-pin item comes back, the rest the same.
select pg_temp.assert(
  pg_temp.names('anon', null, null) =
    array['TEST Biz 01', 'TEST Biz 03', 'TEST Broken hours', 'TEST Legacy hours', 'TEST NoPin biz', 'TEST Place 01'],
  '2.7: with no location the no-pin business is allowed, got ' || pg_temp.names('anon', null, null)::text);

-- 2.7 A pin 15 km out is unusable too, so the no-pin item is allowed again.
select pg_temp.assert(
  'TEST NoPin biz' = any (pg_temp.names('anon', 14.7114, 121.0851)),
  '2.7: a pin 15 km out is unusable, so the no-pin business is allowed');

-- 2.9 The owner of the unverified listing, and both staff roles, get the same
-- filtering as anon, even though their own policies let them read the row.
select pg_temp.assert(pg_temp.can_read('vendor1', 'businesses', 'TEST Unverified biz'),
  '2.9 precondition: vendor1 can read their own unverified listing');
select pg_temp.assert(pg_temp.can_read('staff.business', 'businesses', 'TEST Unverified biz'),
  '2.9 precondition: staff.business can read the unverified listing');
select pg_temp.assert(pg_temp.can_read('staff.places', 'places', 'TEST Place Pending'),
  '2.9 precondition: staff.places can read the pending place');
select pg_temp.assert(not pg_temp.can_read('anon', 'places', 'TEST Place Pending'),
  '2.9 precondition: anon cannot read the pending place');
select pg_temp.assert(
  pg_temp.names('vendor1', 14.5764, 121.0851) = pg_temp.names('anon', 14.5764, 121.0851),
  '2.9: the owner sees the same row as anon, not their own unverified listing');
select pg_temp.assert(
  pg_temp.names('staff.business', 14.5764, 121.0851) = pg_temp.names('anon', 14.5764, 121.0851),
  '2.9: staff.business gets the same filtering as anon');
select pg_temp.assert(
  pg_temp.names('staff.places', 14.5764, 121.0851) = pg_temp.names('anon', 14.5764, 121.0851),
  '2.9: staff.places gets the same filtering as anon (pending place stays out)');

-- 2.8 Saved items are left out, 2.4 hidden items never appear. resident1 saves
-- Place 01 and hides Biz 01. Anon is unchanged.
insert into public.saved_places (user_id, place_id)
select d.id, pl.id from pg_temp.demo_users d, public.places pl where d.name = 'resident1' and pl.name = 'TEST Place 01';
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'resident1'));
insert into public.rec_hides (user_id, kind, item_id)
select (select id from pg_temp.demo_users where name = 'resident1'), 'business', b.id
from public.businesses b where b.name = 'TEST Biz 01';
select pg_temp.as_owner();
select pg_temp.assert(
  pg_temp.names('resident1', 14.5764, 121.0851) = array['TEST Biz 03', 'TEST Broken hours', 'TEST Legacy hours'],
  '2.4/2.8: resident1 loses the saved place and the hidden business, got ' || pg_temp.names('resident1', 14.5764, 121.0851)::text);
select pg_temp.assert(
  pg_temp.names('anon', 14.5764, 121.0851) =
    array['TEST Biz 01', 'TEST Biz 03', 'TEST Broken hours', 'TEST Legacy hours', 'TEST Place 01'],
  '2.4/2.8: another caller still sees the item resident1 saved and hid');
select pg_temp.assert(
  pg_temp.names('resident2', 14.5764, 121.0851) = pg_temp.names('anon', 14.5764, 121.0851),
  '2.4/2.8: resident2 is not affected by resident1''s saves and hides');

-- 2.8 The anchor is left out of its own Similar row. Anchor Biz 03 as anon.
select pg_temp.assert(
  pg_temp.names('anon', 14.5764, 121.0851, 'business', (select id from public.businesses where name = 'TEST Biz 03')) =
    array['TEST Biz 01', 'TEST Broken hours', 'TEST Legacy hours', 'TEST Place 01'],
  '2.8: the anchor item is left out, got '
    || pg_temp.names('anon', 14.5764, 121.0851, 'business', (select id from public.businesses where name = 'TEST Biz 03'))::text);
rollback to savepoint eligibility;

-- ---------------------------------------------------------------------------
-- Fairness: flip tests (2.10 to 2.13)
-- ---------------------------------------------------------------------------
-- The full main cluster, fixed clock. The target is the first business at or
-- below slot 15 of the 30 row, so a change that lifts or drops it moves the
-- row. Anything that changes the output for crowd signals, registration,
-- photos or description length is a failure. A signed in caller is checked
-- as well as anon.
select set_config('app.rec_now', '2026-10-05 10:00:00+08', true);
create temp table pg_temp.target as
  select r.name from pg_temp.rec('anon', 14.5764, 121.0851, 30) r
  where r.kind = 'business' and r.pos >= 15 order by r.pos limit 1;
create temp table pg_temp.base as
  select pg_temp.snap('anon', 14.5764, 121.0851, 12) as anon12, pg_temp.snap('anon', 14.5764, 121.0851, 30) as anon30,
         pg_temp.snap('resident1', 14.5764, 121.0851, 30) as res30;

-- Not an empty comparison: the snapshot has real rows, and the flip target is in it.
select pg_temp.assert((select length(anon30) > 200 from pg_temp.base), 'fairness: baseline snapshot has rows');
select pg_temp.assert((select anon30 like '%' || (select name from pg_temp.target) || '|%' from pg_temp.base), 'fairness: the flip target is in the baseline row');

-- 2.10 Fifty open reports on the target.
insert into public.business_flags (business_id, flag_reason, flagged_by)
select b.id, 'TEST report ' || g, (select id from pg_temp.demo_users where name = 'resident2')
from public.businesses b, generate_series(1, 50) g where b.name = (select name from pg_temp.target);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 12) = (select anon12 from pg_temp.base), '2.10: 50 open reports changed the 12 row for anon');
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 30) = (select anon30 from pg_temp.base), '2.10: 50 open reports changed the 30 row for anon');
select pg_temp.assert(pg_temp.snap('resident1', 14.5764, 121.0851, 30) = (select res30 from pg_temp.base), '2.10: 50 open reports changed the row for a signed in user');

-- 2.11 Crowd counters.
update public.businesses set views_count = 99999, saves_count = 5000 where name = (select name from pg_temp.target);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 30) = (select anon30 from pg_temp.base), '2.11: views_count and saves_count changed the row');
select pg_temp.assert(pg_temp.snap('resident1', 14.5764, 121.0851, 30) = (select res30 from pg_temp.base), '2.11: views_count and saves_count changed the signed in row');

-- 2.12 Registered or informal, both directions.
update public.businesses set registered_or_informal = 'registered' where name = (select name from pg_temp.target);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 30) = (select anon30 from pg_temp.base), '2.12: registered changed the row');
update public.businesses set registered_or_informal = 'informal' where name = (select name from pg_temp.target);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 30) = (select anon30 from pg_temp.base), '2.12: informal changed the row');
update public.businesses set registered_or_informal = null where name = (select name from pg_temp.target);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 30) = (select anon30 from pg_temp.base), '2.12: unset registration changed the row');

-- 2.13 Photos, and the description (length and presence).
insert into public.business_photos (business_id, photo_url, sort_order)
select b.id, '/content-photos/test-' || g || '.jpg', g from public.businesses b, generate_series(1, 6) g where b.name = (select name from pg_temp.target);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 30) = (select anon30 from pg_temp.base), '2.13: photo rows changed the row');
update public.businesses set description = repeat('A very long description. ', 80) where name = (select name from pg_temp.target);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 30) = (select anon30 from pg_temp.base), '2.13: a long description changed the row');
update public.businesses set description = null where name = (select name from pg_temp.target);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 30) = (select anon30 from pg_temp.base), '2.13: no description changed the row');
select pg_temp.assert(pg_temp.snap('resident1', 14.5764, 121.0851, 30) = (select res30 from pg_temp.base), '2.13: photos and description changed the signed in row');

-- Featured gets no boost either (plan, Score).
update public.businesses set featured_status = 'featured' where name = (select name from pg_temp.target);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 30) = (select anon30 from pg_temp.base), 'featured_status changed the row');

-- ---------------------------------------------------------------------------
-- Hours (2.15 to 2.17)
-- ---------------------------------------------------------------------------
-- Straight against rec_open_state. 2026-10-05 is a Monday.
select pg_temp.assert(public.rec_open_state(null) = 'unknown', 'hours: null is unknown');
select pg_temp.assert(public.rec_open_state('') = 'unknown', 'hours: empty is unknown');
select pg_temp.assert(public.rec_open_state('Tuesday to Sunday, 9:00 AM – 4:00 PM') = 'unknown', 'hours: legacy text is unknown');
select pg_temp.assert(public.rec_open_state('{"v":1,"mode":"main","days":{"mon":[["9:00","x"]]}}', '2026-10-05 10:00+08') = 'unknown', 'hours: broken JSON is unknown, no error');
select pg_temp.assert(public.rec_open_state('{"v":2,"mode":"main","days":{}}') = 'unknown', 'hours: another version is unknown');
select pg_temp.assert(public.rec_open_state('{"v":1,"mode":"temp_closed","days":{}}') = 'out', 'hours: temporarily closed is out');
select pg_temp.assert(public.rec_open_state('{"v":1,"mode":"perm_closed","days":{}}') = 'out', 'hours: permanently closed is out');

-- 2.15 A 24:00 end is open at 23:30, a split shift gap is shut, an empty day
-- is shut. A range is open at its start minute and shut at its end minute.
select pg_temp.assert(public.rec_open_state(
  '{"v":1,"mode":"main","days":{"mon":[["18:00","24:00"]],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}',
  '2026-10-05 23:30:00+08') = 'open', '2.15: 24:00 end counts as open at 23:30');
select pg_temp.assert(public.rec_open_state(
  '{"v":1,"mode":"main","days":{"mon":[["09:00","12:00"],["13:00","17:00"]],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}',
  '2026-10-05 12:30:00+08') = 'shut', '2.15: a split shift gap is shut');
select pg_temp.assert(public.rec_open_state(
  '{"v":1,"mode":"main","days":{"mon":[["09:00","12:00"],["13:00","17:00"]],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}',
  '2026-10-05 13:00:00+08') = 'open', '2.15: the second shift is open at its start minute');
select pg_temp.assert(public.rec_open_state(
  '{"v":1,"mode":"main","days":{"mon":[["09:00","12:00"]],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}',
  '2026-10-05 12:00:00+08') = 'shut', '2.15: a range is shut at its end minute');
select pg_temp.assert(public.rec_open_state(
  '{"v":1,"mode":"main","days":{"mon":[],"tue":[["09:00","17:00"]],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}',
  '2026-10-05 10:00:00+08') = 'shut', '2.15: an empty day is shut');

-- 2.16 Manila boundary: 16:30 UTC on Monday is 00:30 on Tuesday in Manila.
select pg_temp.assert(public.rec_open_state(
  '{"v":1,"mode":"main","days":{"mon":[],"tue":[["00:00","01:00"]],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}',
  '2026-10-05 16:30:00+00') = 'open', '2.16: 16:30 UTC reads as 00:30 Tuesday in Manila');
select pg_temp.assert(public.rec_open_state(
  '{"v":1,"mode":"main","days":{"mon":[["23:00","24:00"]],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}',
  '2026-10-05 15:30:00+00') = 'open', '2.16: 15:30 UTC reads as 23:30 Monday in Manila');
select pg_temp.assert(public.rec_open_state(
  '{"v":1,"mode":"main","days":{"mon":[["23:00","24:00"]],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}',
  '2026-10-05 16:30:00+00') = 'shut', '2.16: 16:30 UTC is already Tuesday, so Monday hours do not apply');

-- 2.17 With all else equal, unknown ranks between open and shut. Three
-- businesses at one spot, one category, one vector, differing only in hours.
savepoint hours_rank;
select pg_temp.only(array['TEST Hours open', 'TEST Hours unknown', 'TEST Hours shut']);
insert into public.businesses (name, business_type, address, latitude, longitude, submitted_by, verification_status, category_id, opening_hours)
select n, 'Product', 'TEST', 14.5764, 121.0851, (select id from pg_temp.demo_users where name = 'vendor1'), 'pending',
       (select id from public.business_categories where name = 'TEST Food'), hrs
from (values
  ('TEST Hours open',    '{"v":1,"mode":"main","days":{"mon":[["09:00","17:00"]],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}'),
  ('TEST Hours unknown', null),
  ('TEST Hours shut',    '{"v":1,"mode":"main","days":{"mon":[["18:00","20:00"]],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}')
) as t(n, hrs);
select set_config('app.rec_now', '2026-10-05 10:00:00+08', true);
select pg_temp.assert(
  (select array_agg(r.name order by r.pos) from pg_temp.rec('anon', 14.5764, 121.0851) r)
    = array['TEST Hours open', 'TEST Hours unknown', 'TEST Hours shut'],
  '2.17: open, then unknown, then shut, got '
    || (select array_agg(r.name order by r.pos) from pg_temp.rec('anon', 14.5764, 121.0851) r)::text);
select pg_temp.assert(
  (select r.reason from pg_temp.rec('anon', 14.5764, 121.0851) r where r.name = 'TEST Hours open') = 'Open now',
  '2.17: the open item says Open now');
select pg_temp.assert(
  (select r.reason from pg_temp.rec('anon', 14.5764, 121.0851) r where r.name = 'TEST Hours unknown') = 'Near you',
  '2.17: an unknown item says Near you, not Open now');
rollback to savepoint hours_rank;

-- ---------------------------------------------------------------------------
-- Distance still matters
-- ---------------------------------------------------------------------------
-- The spread below needs distance to be gentle inside a neighbourhood. This
-- keeps it from being flat: two businesses alike in everything but distance,
-- one about 200 m away and one about 6 km away, both inside the 10 km rule.
savepoint distance_rank;
select pg_temp.only(array['TEST Dist near', 'TEST Dist far']);
insert into public.businesses (name, business_type, address, latitude, longitude, submitted_by, verification_status, category_id)
select n, 'Product', 'TEST', la, 121.0851, (select id from pg_temp.demo_users where name = 'vendor1'), 'pending',
       (select id from public.business_categories where name = c)
from (values ('TEST Dist near', 14.5782, 'TEST Food'), ('TEST Dist far', 14.6304, 'TEST Shop')) as t(n, la, c);
select pg_temp.assert(
  (select array_agg(r.name order by r.pos) from pg_temp.rec('anon', 14.5764, 121.0851, 30, null, null, '2026-10-05 10:00:00+08') r)
    = array['TEST Dist near', 'TEST Dist far'],
  'distance: the near business ranks before the far one, got '
    || (select array_agg(r.name order by r.pos) from pg_temp.rec('anon', 14.5764, 121.0851) r)::text);
select pg_temp.assert(
  (select round(r.km::numeric, 1) from pg_temp.rec('anon', 14.5764, 121.0851) r where r.name = 'TEST Dist far') > 5.5,
  'distance precondition: the far business is about 6 km away');
rollback to savepoint distance_rank;

-- ---------------------------------------------------------------------------
-- Rotation and spread (2.18 to 2.20)
-- ---------------------------------------------------------------------------
-- Row of 12 for anon at the pin, seven days from the same clock.
create temp table pg_temp.week as
select d.n as day, r.pos, r.kind, r.name, r.km
from generate_series(0, 6) d(n)
cross join lateral pg_temp.rec('anon', 14.5764, 121.0851, 12, null, null,
  ((timestamptz '2026-10-05 10:00:00+08') + d.n * interval '1 day')::text) r;

-- 2.18 Same call twice on one day gives the same row, the next day changes it.
select pg_temp.assert(
  pg_temp.snap('anon', 14.5764, 121.0851, 12) = pg_temp.snap('anon', 14.5764, 121.0851, 12),
  '2.18: the same call twice in one day gave different rows');
select set_config('app.rec_now', '2026-10-05 08:00:00+08', true);
create temp table pg_temp.same_day as
  select pg_temp.snap('anon', 14.5764, 121.0851, 12) as morning;
select set_config('app.rec_now', '2026-10-05 22:00:00+08', true);
select pg_temp.assert(pg_temp.snap('anon', 14.5764, 121.0851, 12) = (select morning from pg_temp.same_day),
  '2.18: morning and night of the same Manila day gave different rows');
select pg_temp.assert(
  (select count(distinct s) from (
     select string_agg(name, ',' order by pos) s from pg_temp.week group by day) x) >= 6,
  '2.18: the row should change from one day to the next, got '
    || (select count(distinct s) from (select string_agg(name, ',' order by pos) s from pg_temp.week group by day) x) || ' distinct rows in 7 days');

-- 2.19 Over 7 days most eligible businesses within 2 km appear at least once,
-- and no business holds the top slot all 7 days.
select pg_temp.assert((select max(km) <= 2.0 from pg_temp.week), 'spread precondition: every item in the row is within 2 km');
do $$
declare
  eligible int;
  seen int;
  top_days int;
begin
  select count(*) into eligible
  from public.businesses
  where name like 'TEST%' and name not like 'TEST Q %' and verification_status in ('verified', 'pending')
    and latitude is not null and public.rec_open_state(opening_hours) <> 'out';
  select count(distinct name) into seen from pg_temp.week where kind = 'business';
  select max(c) into top_days from (select count(*) c from pg_temp.week where pos = 1 group by name) x;
  raise notice 'spread: % of % eligible businesses within 2 km appeared in 7 days (row of 12); the most days any item held slot 1: %',
    seen, eligible, top_days;
  if seen * 2 <= eligible then
    raise exception 'FAILED: 2.19: only % of % eligible businesses appeared in 7 days, "most" means more than half', seen, eligible;
  end if;
  if top_days >= 7 then
    raise exception 'FAILED: 2.19: one business held the top slot all 7 days';
  end if;
end $$;

-- 2.20 Four thin and four detailed listings that tie pairwise. Both groups
-- appear over the week, and neither is shut out in favour of the other.
do $$
declare
  thin int;
  detailed int;
begin
  select count(*) into thin from pg_temp.week where name like 'TEST Thin %';
  select count(*) into detailed from pg_temp.week where name like 'TEST Detailed %';
  raise notice 'thin vs detailed: % thin and % detailed appearances in 7 days', thin, detailed;
  if thin = 0 or detailed = 0 then
    raise exception 'FAILED: 2.20: thin listings appeared % times and detailed ones % times in 7 days, both should appear', thin, detailed;
  end if;
  if thin * 3 < detailed or detailed * 3 < thin then
    raise exception 'FAILED: 2.20: thin % and detailed % appearances differ by more than 3 to 1', thin, detailed;
  end if;
end $$;

-- Registration does not move anyone either: informal and registered
-- businesses both reach the row over the week.
select pg_temp.assert(
  exists (select 1 from pg_temp.week w join public.businesses b on b.name = w.name where b.registered_or_informal = 'informal')
  and exists (select 1 from pg_temp.week w join public.businesses b on b.name = w.name where b.registered_or_informal = 'registered'),
  '2.12/2.19: both informal and registered businesses appear over the week');

-- ---------------------------------------------------------------------------
-- Taste, cap, preferences, anchor (2.21 to 2.24)
-- ---------------------------------------------------------------------------
-- 2.21 At most 3 per category, and the cap actually binds in this world: 30
-- businesses over five categories would otherwise put 6 in a category.
select set_config('app.rec_now', '2026-10-05 10:00:00+08', true);
select pg_temp.assert(
  (select max(n) from (
     select r.kind, count(*) n
     from pg_temp.rec('anon', 14.5764, 121.0851, 30) r
     left join public.places pl on r.kind = 'place' and pl.id = r.id
     left join public.businesses b on r.kind = 'business' and b.id = r.id
     group by r.kind, coalesce(pl.category_id, b.category_id, r.id)) x) = 3,
  '2.21: the highest count per category should be exactly 3');

-- 2.22 Saving an item lifts similar items. resident1 saves Q Place A1 (direction
-- A). At the taste cluster: A items first, an item with no vector in the
-- middle (neutral, never last), B / C / D at the bottom.
insert into public.saved_places (user_id, place_id)
select d.id, pl.id from pg_temp.demo_users d, public.places pl where d.name = 'resident1' and pl.name = 'TEST Q Place A1';
select pg_temp.assert(
  pg_temp.names('resident1', 14.9, 121.4) = array[
    'TEST Q Biz A', 'TEST Q Biz B', 'TEST Q Biz Bp', 'TEST Q Biz C', 'TEST Q Biz D', 'TEST Q Biz NoEmb',
    'TEST Q Place A2', 'TEST Q Place B1', 'TEST Q Place C1'],
  '2.8/2.22: at the taste cluster resident1 gets everything except the saved place, got '
    || pg_temp.names('resident1', 14.9, 121.4)::text);
select pg_temp.assert(
  pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Biz A') <= 2 and pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Place A2') <= 2,
  '2.22: saving an A item lifts the other A items to the top');
select pg_temp.assert(
  pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Biz NoEmb') > 2
  and pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Biz NoEmb') < pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Biz B'),
  '2.22: an item with no embedding sits between the similar and the dissimilar items');
select pg_temp.assert(
  pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Biz NoEmb') < (select max(pos) from pg_temp.rec('resident1', 14.9, 121.4, 30)),
  '2.22: an item with no embedding is never last');
select pg_temp.assert(
  (select reason from pg_temp.rec('resident1', 14.9, 121.4, 30) where name = 'TEST Q Biz A') = 'Similar to TEST Q Place A1',
  '2.22: the reason names the saved place it is similar to');
select pg_temp.assert(
  (select reason from pg_temp.rec('resident1', 14.9, 121.4, 30) where name = 'TEST Q Biz B') = 'Near you',
  '2.22: a dissimilar item says Near you');
-- Guests have no taste: every reason is Near you and none says Similar.
select pg_temp.assert(
  not exists (select 1 from pg_temp.rec('anon', 14.9, 121.4, 30) r where r.reason like 'Similar%'),
  '2.22: a guest has no taste, so no Similar reason');

-- Taste also comes from completed trail stops. resident2 completes a trail
-- whose only stop is Q Place B1 (direction B), so B items rise for resident2.
insert into public.routes (name, status) values ('TEST trail', 'published');
insert into public.route_stops (route_id, stop_type, stop_id, sequence_order)
select r.id, 'place', pl.id, 1 from public.routes r, public.places pl where r.name = 'TEST trail' and pl.name = 'TEST Q Place B1';
insert into public.completed_routes (user_id, route_id)
select d.id, r.id from pg_temp.demo_users d, public.routes r where d.name = 'resident2' and r.name = 'TEST trail';
select pg_temp.assert(
  pg_temp.pos_of('resident2', 14.9, 121.4, 'TEST Q Biz B') < pg_temp.pos_of('resident2', 14.9, 121.4, 'TEST Q Biz A')
  and pg_temp.pos_of('resident2', 14.9, 121.4, 'TEST Q Biz B') < pg_temp.pos_of('resident2', 14.9, 121.4, 'TEST Q Biz D'),
  '2.22: a completed trail stop lifts items like it');
select pg_temp.assert(
  (select reason from pg_temp.rec('resident2', 14.9, 121.4, 30) where name = 'TEST Q Biz B') = 'Similar to TEST Q Place B1',
  '2.22: the trail stop taste names the stop');
select pg_temp.assert(
  pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Biz B') > pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Biz A'),
  '2.22: resident2''s trail does not change resident1''s row');

-- 2.23 A preferred category lifts an item inside the same band. Q Biz B and
-- Q Biz Bp share a vector, so they share a band. Bp is in the preferred
-- category. Checked with taste on (resident1's save) and with taste off (a
-- fresh caller, resident2 minus the trail).
update public.profiles set preferred_categories = array['TEST Pref Cat']
  where id = (select id from pg_temp.demo_users where name = 'resident1');
select pg_temp.assert(
  pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Biz Bp') < pg_temp.pos_of('resident1', 14.9, 121.4, 'TEST Q Biz B'),
  '2.23: the preferred category lifts Bp over B inside one band (taste on)');
delete from public.completed_routes where user_id = (select id from pg_temp.demo_users where name = 'resident2');
update public.profiles set preferred_categories = array['TEST Pref Cat']
  where id = (select id from pg_temp.demo_users where name = 'resident2');
select pg_temp.assert(
  pg_temp.pos_of('resident2', 14.9, 121.4, 'TEST Q Biz Bp') < pg_temp.pos_of('resident2', 14.9, 121.4, 'TEST Q Biz B'),
  '2.23: the preferred category lifts Bp over B (taste off)');
select pg_temp.assert(
  (select count(*) from pg_temp.rec('resident2', 14.9, 121.4, 30) where reason like 'Similar%') = 0,
  '2.23: no history means no taste term and no Similar reason');
-- A guest gets no preferred bonus, and nobody else gets resident2's.
select pg_temp.assert(
  pg_temp.pos_of('anon', 14.9, 121.4, 'TEST Q Biz Bp') is not null,
  '2.23: guest call returns rows at the taste cluster');
update public.profiles set preferred_categories = null
  where id in (select id from pg_temp.demo_users where name in ('resident1', 'resident2'));

-- 2.24 Anchor mode: anchor Q Place A1 as anon returns A items first, leaves
-- the anchor out, never says Similar to, and respects a signed in caller's hides.
select pg_temp.assert(
  not exists (select 1 from pg_temp.rec('anon', 14.9, 121.4, 30, 'place', (select id from public.places where name = 'TEST Q Place A1')) r where r.name = 'TEST Q Place A1'),
  '2.24: the anchor is left out of its own row');
select pg_temp.assert(
  (select array_agg(r.name order by r.name) from pg_temp.rec('anon', 14.9, 121.4, 2, 'place', (select id from public.places where name = 'TEST Q Place A1')) r)
    = array['TEST Q Biz A', 'TEST Q Place A2'],
  '2.24: with an anchor in direction A, the top two are the other A items');
select pg_temp.assert(
  not exists (select 1 from pg_temp.rec('anon', 14.9, 121.4, 30, 'place', (select id from public.places where name = 'TEST Q Place A1')) r where r.reason like 'Similar%'),
  '2.24: anchor mode never gives the Similar to reason');
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'resident2'));
insert into public.rec_hides (user_id, kind, item_id)
select (select id from pg_temp.demo_users where name = 'resident2'), 'place', pl.id from public.places pl where pl.name = 'TEST Q Place A2';
select pg_temp.as_owner();
select pg_temp.assert(
  not exists (select 1 from pg_temp.rec('resident2', 14.9, 121.4, 30, 'place', (select id from public.places where name = 'TEST Q Place A1')) r where r.name = 'TEST Q Place A2'),
  '2.24: anchor mode respects the caller''s hides');
select pg_temp.assert(
  exists (select 1 from pg_temp.rec('anon', 14.9, 121.4, 30, 'place', (select id from public.places where name = 'TEST Q Place A1')) r where r.name = 'TEST Q Place A2'),
  '2.24: the same hide does not touch another caller');
delete from public.rec_hides;

-- ---------------------------------------------------------------------------
-- Table access (2.25 to 2.27)
-- ---------------------------------------------------------------------------
-- 2.25 Anon reads the embedding of a verified place and a pending business,
-- not of a pending place or an unverified business.
select pg_temp.as_anon();
do $$
declare
  n int;
begin
  select count(*) into n from public.item_embeddings e join public.places pl on pl.id = e.item_id
    where e.kind = 'place' and pl.name = 'TEST Place 01';
  if n <> 1 then raise exception 'FAILED: 2.25: anon should read the embedding of a verified place, saw %', n; end if;
  select count(*) into n from public.item_embeddings where kind = 'business'
    and item_id = (select id from public.businesses where name = 'TEST Biz 01');
  if n <> 1 then raise exception 'FAILED: 2.25: anon should read the embedding of a pending business, saw %', n; end if;
end $$;
select pg_temp.as_owner();
-- The ids are looked up as owner, since anon cannot see the hidden rows.
create temp table pg_temp.hidden_ids as
  select (select id from public.places where name = 'TEST Place Pending') as place_pending,
         (select id from public.places where name = 'TEST Place Rejected') as place_rejected,
         (select id from public.businesses where name = 'TEST Unverified biz') as biz_unverified;
grant select on pg_temp.hidden_ids to public;
select pg_temp.assert((select count(*) from pg_temp.hidden_ids where place_pending is not null and place_rejected is not null and biz_unverified is not null) = 1,
  '2.25 setup: hidden item ids found');
-- These three already have fixture vectors, so a leak would be visible.
select pg_temp.assert((select count(*) from public.item_embeddings e, pg_temp.hidden_ids h
  where (e.kind = 'place' and e.item_id in (h.place_pending, h.place_rejected))
     or (e.kind = 'business' and e.item_id = h.biz_unverified)) = 3,
  '2.25 setup: the hidden items have embeddings to protect');
select pg_temp.as_anon();
do $$
declare
  n int;
begin
  select count(*) into n from public.item_embeddings e where e.kind = 'place'
    and e.item_id in (select place_pending from pg_temp.hidden_ids union select place_rejected from pg_temp.hidden_ids);
  if n <> 0 then raise exception 'FAILED: 2.25: anon read the embedding of a pending or rejected place (%)', n; end if;
  select count(*) into n from public.item_embeddings e where e.kind = 'business'
    and e.item_id = (select biz_unverified from pg_temp.hidden_ids);
  if n <> 0 then raise exception 'FAILED: 2.25: anon read the embedding of an unverified business (%)', n; end if;
end $$;
select pg_temp.as_owner();

-- 2.26 Authenticated cannot insert, update or delete item_embeddings.
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'admin1'));
do $$
declare
  n int;
  before_n int;
begin
  select count(*) into before_n from public.item_embeddings;
  begin
    insert into public.item_embeddings (kind, item_id, model, content_hash, embedding)
    values ('place', gen_random_uuid(), 'TEST', 'x', pg_temp.vec(1));
    raise exception 'FAILED: 2.26: authenticated could insert into item_embeddings';
  exception when insufficient_privilege then null;
  end;
  -- No policy means zero rows touched. A missing grant (permission denied) is
  -- just as good, so either outcome passes and only a changed row fails.
  begin
    update public.item_embeddings set model = 'HACKED';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAILED: 2.26: authenticated updated % embedding rows', n; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.item_embeddings;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAILED: 2.26: authenticated deleted % embedding rows', n; end if;
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.item_embeddings) <> before_n then
    raise exception 'FAILED: 2.26: item_embeddings changed under authenticated';
  end if;
end $$;
select pg_temp.as_owner();
select pg_temp.assert((select count(*) from public.item_embeddings where model = 'HACKED') = 0, '2.26: no row was updated');

-- 2.27 resident2 cannot read or delete resident1's hides, and cannot write one
-- for them. A guest cannot insert.
insert into public.rec_hides (user_id, kind, item_id)
select (select id from pg_temp.demo_users where name = 'resident1'), 'place', pl.id from public.places pl where pl.name = 'TEST Place 02';
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'resident2'));
do $$
declare
  n int;
begin
  select count(*) into n from public.rec_hides;
  if n <> 0 then raise exception 'FAILED: 2.27: resident2 read % of resident1''s hides', n; end if;
  delete from public.rec_hides;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: 2.27: resident2 deleted % of resident1''s hides', n; end if;
  begin
    insert into public.rec_hides (user_id, kind, item_id)
    select (select id from pg_temp.demo_users where name = 'resident1'), 'place', pl.id from public.places pl where pl.name = 'TEST Place 03';
    raise exception 'FAILED: 2.27: resident2 inserted a hide for resident1';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.as_owner();
select pg_temp.assert((select count(*) from public.rec_hides) = 1, '2.27: resident1''s hide is still there');
select pg_temp.as_user((select id from pg_temp.demo_users where name = 'resident1'));
select pg_temp.assert((select count(*) from public.rec_hides) = 1, '2.27: resident1 reads their own hide');
select pg_temp.as_owner();
select pg_temp.as_anon();
do $$
begin
  begin
    insert into public.rec_hides (user_id, kind, item_id)
    values ((select id from pg_temp.demo_users where name = 'resident1'), 'place', gen_random_uuid());
    raise exception 'FAILED: 2.27: a guest inserted a hide';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.as_owner();
delete from public.rec_hides;

-- ---------------------------------------------------------------------------
-- Clamp and fallbacks (2.14)
-- ---------------------------------------------------------------------------
select set_config('app.rec_now', '2026-10-05 10:00:00+08', true);
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 14.5764, 121.0851, 0)) = 1, 'lim 0 is clamped up to 1 row');
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 14.5764, 121.0851, -5)) = 1, 'a negative lim is clamped up to 1 row');
-- Clamp down is tested with no location: at the pin the 3 per category cap
-- leaves only about 27 eligible items, with no location every fixture is in play.
select pg_temp.assert((select count(*) from pg_temp.rec('anon', null, null, 500)) = 30, 'lim 500 is clamped down to 30 rows');
-- A null lim is not an error and stays inside the 1 to 30 clamp.
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 14.5764, 121.0851, null)) between 1 and 30, 'a null lim returns 1 to 30 rows');

-- As a guest with no location, no taste: never empty, no distance, no reason.
select pg_temp.assert((select count(*) from pg_temp.rec('anon', null, null, 12)) = 12, '2.14: guest with no location gets a full row');
select pg_temp.assert((select count(*) from pg_temp.rec('anon', null, null, 12) where km is not null or reason is not null) = 0,
  '2.14: with no location there is no distance and no reason');
-- Only one coordinate is the same as none.
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 14.5764, null, 12)) = 12, '2.14: a lone latitude is treated as no location');
select pg_temp.assert((select count(*) from pg_temp.rec('anon', null, 121.0851, 12) where km is not null) = 0, '2.14: a lone longitude gives no distance');
-- No taste, signed in: never empty.
select pg_temp.assert((select count(*) from pg_temp.rec('resident1', 14.5764, 121.0851, 12)) = 12, '2.14: signed in with no history gets a full row');
-- A pin 15 km north: distance becomes null, row still full, reason empty.
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 14.7114, 121.0851, 12)) = 12, '2.14: a pin 15 km out still gets a full row');
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 14.7114, 121.0851, 12) where km is not null or reason is not null) = 0,
  '2.14: a pin 15 km out is treated as no location, no distance and no reason');
-- A pin far from everything, outside the 0.2 degree box too.
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 10.0, 120.0, 12)) = 12, '2.14: a pin hundreds of km away still gets a full row');
-- A bad value for the test clock never errors.
select set_config('app.rec_now', 'not a date', true);
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 14.5764, 121.0851, 12)) = 12, 'a bad app.rec_now falls back to the real clock');
select set_config('app.rec_now', '2026-10-05 10:00:00+08', true);

-- Everything saved or hidden or ineligible leaves an empty row, not an error.
savepoint empty_world;
select pg_temp.only(array['none']);
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 14.5764, 121.0851, 12)) = 0, '2.14: with no eligible item the row is empty, not an error');
select pg_temp.assert((select count(*) from pg_temp.rec('anon', null, null, 12)) = 0, '2.14: with no eligible item and no location the row is empty too');
rollback to savepoint empty_world;

-- No embeddings at all: still a full row, everything neutral.
delete from public.item_embeddings;
select pg_temp.assert((select count(*) from pg_temp.rec('anon', 14.5764, 121.0851, 12)) = 12, '2.14: with no embeddings at all the row is full');
select pg_temp.assert((select count(*) from pg_temp.rec('resident1', 14.5764, 121.0851, 12)) = 12, '2.14: signed in with no embeddings at all the row is full');
select pg_temp.assert(
  (select count(*) from pg_temp.rec('anon', 14.5764, 121.0851, 12, 'business', (select id from public.businesses where name = 'TEST Biz 03'))) = 12,
  '2.14: anchor mode with no embedding for the anchor is still a full row');

rollback;

-- ---------------------------------------------------------------------------
-- Part 2: top 5 for 10 sample pins as anon (2.29)
-- ---------------------------------------------------------------------------
-- For the CATO review (recommendation-phases.md Phase 14). Reads whatever
-- content is in the database, inserts nothing. Nine pins are barangay
-- centroids from public/data/pasig-barangays.geojson (the largest polygon of
-- each, spread over the city), the tenth is far outside Pasig and exercises
-- the 10 km rule: its rows should carry no distance and no reason. On the
-- seeded database this shows the seeded content, on a database with only
-- fixtures it shows nothing, which is fine.
begin;
set local role anon;
select p.label as pin, r.n as pos, r.kind, coalesce(pl.name, b.name) as name,
       coalesce(pc.name, bc.name, b.category_text_legacy) as category,
       coalesce(pl.verification_status, b.verification_status) as status,
       r.reason, round(r.distance_km::numeric, 2) as km
from (values
  ('Pinagbuhatan',  14.54972, 121.09751),
  ('Santolan',      14.61551, 121.08625),
  ('Kapitolyo',     14.57115, 121.05973),
  ('Santa Lucia',   14.58356, 121.10145),
  ('Santa Cruz',    14.56319, 121.07961),
  ('Ugong',         14.58372, 121.07328),
  ('Manggahan',     14.60115, 121.09534),
  ('Buting',        14.55442, 121.06822),
  ('Maybunga',      14.57621, 121.09078),
  ('Outside Pasig (Tagaytay)', 14.11000, 120.96000)
) as p(label, lat, lng)
cross join lateral public.recommend_items(p.lat, p.lng, 5) with ordinality as r(kind, id, reason, distance_km, n)
left join public.places pl on r.kind = 'place' and pl.id = r.id
left join public.place_categories pc on pc.id = pl.category_id
left join public.businesses b on r.kind = 'business' and b.id = r.id
left join public.business_categories bc on bc.id = b.category_id
order by p.label, r.n;
rollback;
