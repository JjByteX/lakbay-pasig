-- =============================================================================
-- Lakbay Pasig — Local Development Seed Data
-- =============================================================================
-- Auto-applied by `supabase db reset` / `supabase start` on the LOCAL Docker
-- stack only. Never runs against the hosted project: CI's deploy-migrations
-- job only runs `supabase db push` (migrations), never `db reset`, and this
-- file is never referenced by that job. Safe to keep in the repo.
--
-- Everyone in here is a demo account. No real names, no real contact info,
-- no real vendor identities. Every login uses the same throwaway password so
-- the whole team can sign in as anyone during development without asking
-- each other for accounts. Passwords are Supabase Auth's own bcrypt hash of
-- the string below, so nothing here is a fresh secret to rotate:
--
--   Password for every seeded account:  Demo!Password123
--
-- Covers all four roles from project-foundation/project-brief.md:
--   - CATO Staff (Admin + Staff, mixed permission sets, one inactive, one
--     with zero permissions to exercise admin.tsx's "no sections assigned"
--     state)
--   - Registered User (residents, no business)
--   - Vendor (a resident who submitted a business — vendor-mode-spec.md:
--     "Vendor is not a separate account type. It is a mode switch on a
--     Registered User account")
--   - Guest requires no seed row, it is the no-session state.
--
-- Profiles (auth accounts, staff, residents, vendors) are still demo data —
-- account ages and permission mixes span every state so every admin list/
-- filter/badge and src/lib/business-queue-priority.ts signal has something
-- to render against, same reasoning as before.
--
-- Places, Businesses, and Events are REAL CATO-submitted content as of the
-- content population pass (build-order.md step 11), not demo data — see
-- project-foundation/open-questions.md and decision-log.md entry #17 for
-- the full replacement history. All content rows are verification_status
-- 'verified' / published true, reflecting that this is CATO's own reviewed
-- content, not a queue exercising every review state the way the original
-- sample data did. Photos point at the real `content-photos` Supabase
-- Storage bucket (migration 0031), not picsum.photos placeholders — see
-- storage-manifest.md for upload paths; the 30 real photo files must be
-- uploaded there before these URLs resolve to anything.
--
-- Routes/Trails (routes, route_stops, discovery_content, trail_credentials)
-- and the personal-record tables that depended on sample route/place ids
-- (completed_routes, user_credentials, saved_routes, saved_places) are
-- INTENTIONALLY EMPTY per open-questions.md #8 — no real Trail data has
-- been submitted yet. See the comment block at that section below for how
-- to resume once it is.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Reset (idempotent re-runs)
-- -----------------------------------------------------------------------------
-- `supabase db reset` already runs this against a fresh database, but running
-- `psql -f seed.sql` twice against the same running instance should not
-- error or duplicate rows. Deleting auth.users cascades into public.profiles
-- (0001: profiles.id references auth.users(id) on delete cascade) and every
-- table below that references profiles/places/businesses/routes cascades
-- from there too. Scoped to @lakbay-demo accounts only, never touches a real
-- account someone made by signing up locally.
delete from auth.users where email like '%@lakbay-demo.local';

-- -----------------------------------------------------------------------------
-- 1. Auth users
-- -----------------------------------------------------------------------------
-- Inserting directly into auth.users is what the local GoTrue instance reads
-- from; this is the same approach Supabase's own seeding docs recommend for
-- local dev. Each insert fires handle_new_user() (0001), which creates the
-- matching public.profiles row with role='resident' by default — staff rows
-- are promoted to role='staff' afterward in section 2, same as an Admin
-- promoting an account in the real Staff section per admin-panel-spec.md,
-- there is no separate staff signup path in this app.
--
-- extensions.crypt(...)/extensions.gen_salt(...) match the bcrypt format
-- GoTrue expects for encrypted_password. Schema-qualified rather than bare
-- crypt()/gen_salt() because `supabase db reset --linked`'s seed step runs
-- over a connection whose search_path doesn't reliably include the
-- `extensions` schema pgcrypto installs into on hosted Supabase, even
-- though the same bare calls resolve fine from `db push`-run migrations
-- and from the Dashboard's SQL Editor. Confirmed against multiple
-- supabase/cli GitHub issues (#318, #568, #4640) reporting the identical
-- "function gen_salt(unknown) does not exist" failure at this exact step,
-- not a local codebase-specific bug. Schema-qualifying removes the
-- dependency on search_path entirely, works from any connection.
-- email_confirmed_at is set so every seeded account can sign in immediately,
-- skipping the Inbucket email-confirmation step purely as a local dev
-- convenience — this does not change how email verification works for
-- anyone signing up for real, per vendor-mode-spec.md's Verification Method
-- section. confirmed_at is a generated column on this Postgres image (it
-- derives from email_confirmed_at), so it's left out of the insert rather
-- than set directly. The token columns below (confirmation_token and
-- friends) are set to '' rather than left NULL: GoTrue's Go client scans
-- them as non-nullable strings, so a NULL here doesn't fail the insert but
-- crashes every later read of the row (including login) with "converting
-- NULL to string is unsupported".

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current, email_change,
  phone_change, phone_change_token, reauthentication_token
)
values
  -- CATO Staff — Admin (2)
  ('00000000-0000-0000-0000-000000000000', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'authenticated', 'authenticated', 'admin1@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '220 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'ab395d2b-a446-4892-b43f-2170af876c8a', 'authenticated', 'authenticated', 'admin2@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '190 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),

  -- CATO Staff — Staff (4)
  ('00000000-0000-0000-0000-000000000000', '6456adca-58a3-48c3-b0e6-6a086d03734f', 'authenticated', 'authenticated', 'staff.places@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '150 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fed52550-3ee1-48da-b033-211f6245fbb6', 'authenticated', 'authenticated', 'staff.business@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '130 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e283c6fb-4dcd-455f-a60c-e35add77a330', 'authenticated', 'authenticated', 'staff.events@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '95 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '9756f8d7-2a8e-4bd8-8669-0eac163096c6', 'authenticated', 'authenticated', 'staff.new@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '5 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  -- landing-hero-phases.md Phase 3.15: demo account holding only the new
  -- manage_landing permission, so the Phase 3 gate ("a staff account with
  -- only this permission ... sees no other admin section") has a real
  -- login to exercise, same reasoning as staff.places/staff.business above.
  ('00000000-0000-0000-0000-000000000000', 'b13f9b4b-6d0a-4f9a-8f5a-2f7cf3a1e6a1', 'authenticated', 'authenticated', 'staff.landing@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '40 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),

  -- Registered Users, no business (6)
  ('00000000-0000-0000-0000-000000000000', 'ed8d4b57-6a77-418b-9db3-11c18e18fbca', 'authenticated', 'authenticated', 'resident1@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '300 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '75486d5a-d222-4853-8046-8a55199c6208', 'authenticated', 'authenticated', 'resident2@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '260 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e927ff41-bff8-43f0-9c1f-98fcaa54793d', 'authenticated', 'authenticated', 'resident3@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '200 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'db860542-f964-4290-a8f4-72c58c0dfff3', 'authenticated', 'authenticated', 'resident4@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '140 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c5a73b63-20bd-4310-9515-3f22fa9dd40c', 'authenticated', 'authenticated', 'resident5@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '60 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '62acb632-8642-4b55-86ac-dfdee7f1d953', 'authenticated', 'authenticated', 'resident6@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '10 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),

  -- Vendors — Registered Users who also hold a business (6). Ages vary on
  -- purpose: some old (established vendor), some brand new (the "new
  -- account" business-queue-priority.ts signal, 30 day window).
  ('00000000-0000-0000-0000-000000000000', 'a77bf9f3-1107-4e9e-9677-ebbcaa662cba', 'authenticated', 'authenticated', 'vendor1@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '400 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fd00f3e8-88bf-4536-96af-86a764856066', 'authenticated', 'authenticated', 'vendor2@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '320 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '1f73e1d0-9eaa-498e-a19d-d6b07b02e9d0', 'authenticated', 'authenticated', 'vendor3@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '250 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '813367e0-97dc-442c-9511-0e6c506c0883', 'authenticated', 'authenticated', 'vendor4@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '45 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '66c28540-f93a-48e2-aaa3-792f34b84491', 'authenticated', 'authenticated', 'vendor5@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '3 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '3541db59-0c27-4324-b685-eb66de017874', 'authenticated', 'authenticated', 'vendor6@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '1 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '');

-- Supabase Auth also expects a matching row in auth.identities for
-- email/password sign-in to resolve correctly in some GoTrue versions.
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  now(),
  u.created_at,
  now()
from auth.users u
where u.email like '%@lakbay-demo.local';

-- -----------------------------------------------------------------------------
-- 2. Profiles — promote staff, fill in fields for everyone
-- -----------------------------------------------------------------------------
-- handle_new_user() (0001) already inserted one row per user above with
-- role='resident'. This section updates those rows directly (bypassing RLS,
-- since this script runs as the postgres superuser via the CLI's seed step,
-- not through the app's own self-update path that 0001/0002 restrict).

-- 2.1 Admin staff
update public.profiles set
  role = 'staff', staff_role = 'admin', active_status = 'active',
  display_name = 'Demo Admin One', contact_number = '+639170000001',
  position = 'CATO Officer In Charge'
where id = 'f25e552f-e90c-4fc4-884e-02f46c40a47f';

update public.profiles set
  role = 'staff', staff_role = 'admin', active_status = 'active',
  display_name = 'Demo Admin Two', contact_number = '+639170000002',
  position = 'Assistant Department Head'
where id = 'ab395d2b-a446-4892-b43f-2170af876c8a';

-- 2.2 Staff — deliberately varied permission sets so every sidebar section
-- combination in admin-panel-spec.md is reachable by at least one demo login.
update public.profiles set
  role = 'staff', staff_role = 'staff', active_status = 'active',
  display_name = 'Demo Staff Places', contact_number = '+639170000003',
  position = 'Heritage Content Officer',
  system_permission = array['manage_places']
where id = '6456adca-58a3-48c3-b0e6-6a086d03734f';

update public.profiles set
  role = 'staff', staff_role = 'staff', active_status = 'active',
  display_name = 'Demo Staff Business', contact_number = '+639170000004',
  position = 'Business Listings Reviewer',
  system_permission = array['review_businesses']
where id = 'fed52550-3ee1-48da-b033-211f6245fbb6';

-- Inactive staff account: exercises auth-context.tsx's isInactiveStaff()
-- forced-signout path. Holds a broad permission set specifically so it's
-- obvious in Studio that access was revoked by active_status, not by an
-- empty system_permission.
update public.profiles set
  role = 'staff', staff_role = 'staff', active_status = 'inactive',
  display_name = 'Demo Staff Events', contact_number = '+639170000005',
  position = 'Former Events Coordinator',
  system_permission = array['publish_events', 'build_trails']
where id = 'e283c6fb-4dcd-455f-a60c-e35add77a330';

-- No-permissions staff account: exercises admin.tsx's "No sections assigned
-- yet" empty state.
update public.profiles set
  role = 'staff', staff_role = 'staff', active_status = 'active',
  display_name = 'Demo Staff Unassigned', contact_number = '+639170000006',
  position = 'Incoming Hire',
  system_permission = array[]::text[]
where id = '9756f8d7-2a8e-4bd8-8669-0eac163096c6';

-- landing-hero-phases.md Phase 3.15: holds only manage_landing, nothing
-- else. Landing Page must be the only content section this login sees.
update public.profiles set
  role = 'staff', staff_role = 'staff', active_status = 'active',
  display_name = 'Demo Staff Landing', contact_number = '+639170000007',
  position = 'Landing Page Content Editor',
  system_permission = array['manage_landing']
where id = 'b13f9b4b-6d0a-4f9a-8f5a-2f7cf3a1e6a1';

-- 2.3 Residents (no business)
update public.profiles set
  display_name = 'Demo Resident One', contact_number = '+639180000001',
  date_of_birth = '1998-03-14',
  preferred_categories = array['Heritage Site', 'Museum']
where id = 'ed8d4b57-6a77-418b-9db3-11c18e18fbca';

update public.profiles set
  display_name = 'Demo Resident Two', contact_number = '+639180000002',
  date_of_birth = '1995-07-22',
  preferred_categories = array['Church', 'Monument']
where id = '75486d5a-d222-4853-8046-8a55199c6208';

update public.profiles set
  display_name = 'Demo Resident Three', contact_number = '+639180000003',
  date_of_birth = '2002-11-02',
  preferred_categories = array['Cultural Site']
where id = 'e927ff41-bff8-43f0-9c1f-98fcaa54793d';

update public.profiles set
  display_name = 'Demo Resident Four', contact_number = '+639180000004',
  date_of_birth = '1990-01-30',
  preferred_categories = array['Heritage Site', 'Church']
where id = 'db860542-f964-4290-a8f4-72c58c0dfff3';

update public.profiles set
  display_name = 'Demo Resident Five', contact_number = '+639180000005',
  date_of_birth = '1988-09-09',
  preferred_categories = array['Museum']
where id = 'c5a73b63-20bd-4310-9515-3f22fa9dd40c';

update public.profiles set
  display_name = 'Demo Resident Six', contact_number = '+639180000006',
  date_of_birth = '2004-05-18',
  preferred_categories = array['Cultural Site', 'Monument']
where id = '62acb632-8642-4b55-86ac-dfdee7f1d953';

-- 2.4 Vendors — still role='resident', per vendor-mode-spec.md: "Vendor is
-- not a separate account type. It is a mode switch on a Registered User
-- account." The businesses table (section 5) is what actually makes each of
-- these a vendor.
update public.profiles set
  display_name = 'Demo Vendor One', contact_number = '+639190000001',
  date_of_birth = '1985-02-11'
where id = 'a77bf9f3-1107-4e9e-9677-ebbcaa662cba';

update public.profiles set
  display_name = 'Demo Vendor Two', contact_number = '+639190000002',
  date_of_birth = '1979-06-25'
where id = 'fd00f3e8-88bf-4536-96af-86a764856066';

update public.profiles set
  display_name = 'Demo Vendor Three', contact_number = '+639190000003',
  date_of_birth = '1993-12-08'
where id = '1f73e1d0-9eaa-498e-a19d-d6b07b02e9d0';

update public.profiles set
  display_name = 'Demo Vendor Four', contact_number = '+639190000004',
  date_of_birth = '1997-04-19'
where id = '813367e0-97dc-442c-9511-0e6c506c0883';

update public.profiles set
  display_name = 'Demo Vendor Five', contact_number = '+639190000005',
  date_of_birth = '2000-08-27'
where id = '66c28540-f93a-48e2-aaa3-792f34b84491';

update public.profiles set
  display_name = 'Demo Vendor Six', contact_number = '+639190000006',
  date_of_birth = '1991-10-03'
where id = '3541db59-0c27-4324-b685-eb66de017874';

commit;

begin;

-- -----------------------------------------------------------------------------
-- 3. Places (5) — real CATO-submitted heritage content, replacing the
--    original 10 sample "Demo ..." rows per content-replacement-plan.md.
--    All 5 verified: this is CATO's own submitted content, reviewed and
--    confirmed via web search cross-reference (see open-questions.md #4),
--    not a pending queue item. Column list matches the current places
--    schema after migrations 0022 (category text -> category_id,
--    references place_categories) and 0026 (facilities text[] ->
--    facility_ids uuid[], references place_facilities), resolved here via
--    subqueries against those tables' name columns, same pattern the
--    original seed used.
--
--    Coordinates: none were supplied with the source content, so these
--    were looked up (Wikipedia/Wikidata for the 3 heritage sites, nearby
--    public landmarks for Plaza Rizal and Youth Development Center) —
--    street/barangay-level accuracy, sufficient for prototype map display,
--    not surveyed. Flag for CATO to confirm exact coordinates before
--    production use.
-- -----------------------------------------------------------------------------

insert into public.places (
  id, name, category_id, description, historical_background, historical_significance,
  year_or_period, source_reference, address, latitude, longitude, operating_hours,
  entrance_fee, visit_duration, accessibility_info, facility_ids,
  verification_status, reviewed_by, updated_at
) values
  ('a1e10001-0001-4c1a-9c1a-000000000001', 'Pasig City Museum (Concepcion Mansion)',
   (select id from public.place_categories where name = 'Museum'),
   'A restored Spanish-Baroque mansion housing artifacts, historical documents, and art exhibits depicting the socio-cultural evolution of Pasig.',
   'Built in 1937 by former Municipal President Don Fortunato Concepcion. During World War II, it was commandeered by Japanese forces as an observation post, and the American flag was raised atop its tower during liberation in 1945. It was acquired by the city government in 2000 and converted into a public museum.',
   'Served as a strategic military outpost during WWII and stands today as a central repository for the city''s local history and identity.',
   '1937 / Pre-War American Period (Spanish-Baroque architectural style)',
   'Pasig City Cultural Affairs and Tourism Office (CATO); National Historical Commission of the Philippines (NHCP)',
   'Plaza Rizal, 2 F. Concepcion St., Brgy. San Jose, Pasig City, 1600 Metro Manila', 14.5609, 121.0762,
   'Tuesday to Sunday, 9:00 AM – 4:00 PM (Closed Mondays)', 0, '45 to 60 minutes',
   'Ground floor exhibits accessible via ramp; upper floors accessible primarily via stairs.',
   (select array_agg(id) from public.place_facilities where name in ('Restrooms', 'Info Desk', 'Parking')),
   'verified', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', now() - interval '5 days'),

  ('a1e10002-0002-4c1a-9c1a-000000000002', 'Immaculate Conception Cathedral',
   (select id from public.place_categories where name = 'Church'),
   'The seat of the Roman Catholic Diocese of Pasig, featuring high stone walls, ornate interior artwork, and historical bell tower structures.',
   'Established in 1572 by Augustinian missionaries, making it one of the oldest parishes in the Philippines. The church was relocated to its current site in 1573, and the present stone foundation was constructed through the late 18th to 19th centuries. It was elevated to cathedral status in 2003.',
   'Functioned as a major evangelization center under Spanish rule and was used as a military stronghold by British soldiers during the British invasion of Manila (1762–1764).',
   'Founded 1572; Current stone structure built 1785–1880 (Spanish Colonial Period)',
   'Roman Catholic Diocese of Pasig Archives; National Historical Commission of the Philippines (NHCP)',
   'Plaza Rizal, Brgy. Malinao, Pasig City, 1600 Metro Manila', 14.5604, 121.0774,
   'Open daily, 6:00 AM – 7:00 PM (Mass schedules vary)', 0, '30 to 45 minutes',
   'Ramp access available at side entry doors; main floor area is level and paved.',
   (select array_agg(id) from public.place_facilities where name in ('Restrooms', 'Waiting Area')),
   'verified', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', now() - interval '5 days'),

  ('a1e10003-0003-4c1a-9c1a-000000000003', 'Bahay na Tisa (Don Cecilio Tech House)',
   (select id from public.place_categories where name = 'Heritage Site'),
   'The oldest surviving bahay na bato (house of brick and tile) in Pasig City, featuring adobe ground floors, wooden upper levels, and original capiz windows.',
   'Built in the early 1850s by Don Cecilio Tech y Cabrera. It has remained continuously inhabited across seven generations of the Tech family. During Martial Law, it earned the nickname "Freedom House" for hosting multi-faction political discussions and local community art exhibits.',
   'Rare intact example of mid-19th-century domestic Spanish-colonial architecture in Metro Manila, hosting long-standing religious traditions such as the annual Viatico Publico.',
   'Circa 1850–1854 / Mid-19th Century Spanish Colonial Period',
   'Pasig City Cultural Affairs and Tourism Office (CATO); Tech Family Historical Records',
   'P. Gomez St., Brgy. San Jose, Pasig City, 1600 Metro Manila', 14.5607, 121.0742,
   'Exterior viewing daily; interior access available by request/arrangement with the family or local tourism office.',
   0, '15 to 30 minutes',
   'Street-level exterior viewing fully accessible; interior contains steep wooden stairways with limited access for visitors with reduced mobility.',
   '{}'::uuid[],
   'verified', 'ab395d2b-a446-4892-b43f-2170af876c8a', now() - interval '5 days'),

  ('a1e10004-0004-4c1a-9c1a-000000000004', 'Plaza Rizal & Bitukang Manok Area (Parian Creek)',
   (select id from public.place_categories where name = 'Monument'),
   'The historic town square of Pasig, bordered by the Pasig Cathedral, Pasig City Museum, and the historic Bitukang Manok (Parian Creek) tributary.',
   'Formed the core urban grid of Pasig under Spanish administration. On August 29, 1896, the area witnessed Nagsabado sa Pasig, when Katipuneros led by Andres Bonifacio and Valentin Cruz assembled and captured the local Spanish headquarters (Tribunal).',
   'Site of one of the earliest major military victories of the Katipunan during the 1896 Philippine Revolution against Spanish rule.',
   'Established late 16th Century; redesigned in the 20th Century (Spanish Colonial to American Period)',
   'Pasig City Government Archives; National Historical Commission of the Philippines (NHCP) Marker',
   'Caruncho Ave. cor. P. Burgos St. & A. Luna St., Brgy. Malinao, Pasig City, 1600 Metro Manila', 14.5606, 121.0768,
   'Open 24 Hours / 7 Days a week (Public Park)', 0, '20 to 30 minutes',
   'Open-air flat surface, fully wheelchair accessible with concrete paved walkways.',
   (select array_agg(id) from public.place_facilities where name in ('Waiting Area')),
   'verified', 'ab395d2b-a446-4892-b43f-2170af876c8a', now() - interval '5 days'),

  -- Added per open-questions.md #7: not among the 4 originally submitted
  -- Places, but required as discovery_content's related_place_id target
  -- for the "Pasig Creative Arts Academy: Summer Youth Workshops" event.
  -- A modern civic facility under CATO's 2026 executive-order oversight,
  -- not a heritage structure, so historical fields stay minimal/not
  -- applicable rather than invented.
  ('a1e10005-0005-4c1a-9c1a-000000000005', 'Youth Development Center',
   (select id from public.place_categories where name = 'Cultural Site'),
   'A city-run youth and community facility hosting CATO-supervised programs, workshops, and events for young Pasigueños.',
   'Placed under CATO''s supervision by executive order in 2026, expanding the office''s oversight beyond heritage sites into active youth programming, including the Pasig Creative Arts Academy.',
   'Not applicable — a modern civic facility, not a heritage structure.',
   'Not applicable', 'Pasig City Cultural Affairs and Tourism Office (CATO)',
   'F. Legaspi St., Rainforest Park, Barangay Maybunga, Pasig City', 14.5738, 121.0977,
   'Monday to Friday, 9:00 AM – 6:00 PM (Closed weekends, except during scheduled programs)',
   0, '30 to 45 minutes, program-dependent',
   'Ground floor accessible; specific accessibility features not yet documented.',
   (select array_agg(id) from public.place_facilities where name in ('Restrooms', 'Parking', 'Waiting Area')),
   'verified', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', now() - interval '2 days');

-- -----------------------------------------------------------------------------
-- 4. Place photos — real Pasig photography per storage-manifest.md.
--    All 30 files must be uploaded to the `content-photos` bucket (created
--    by migration 0031) at the paths below before these URLs resolve;
--    see storage-manifest.md and resume-plan.md item 3. photo_type is set
--    to 'current' throughout: storage-manifest.md's manifest does not
--    distinguish historical vs. current per file, and none of the source
--    material called out a specific photo as archival, so nothing here
--    should be read as an archival/historical photo without confirming
--    against the actual files once uploaded.
--    :SUPABASE_URL is a placeholder for the project's own Supabase URL,
--    substituted in per environment same as storage-manifest.md notes.
-- -----------------------------------------------------------------------------
insert into public.place_photos (place_id, photo_url, photo_type, sort_order) values
  ('a1e10001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/pasig-city-museum/01.jpg', 'current', 0),
  ('a1e10001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/pasig-city-museum/02.jpg', 'current', 1),
  ('a1e10001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/pasig-city-museum/03.jpg', 'current', 2),
  ('a1e10001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/pasig-city-museum/04.jpg', 'current', 3),
  ('a1e10001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/pasig-city-museum/05.jpg', 'current', 4),
  ('a1e10001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/pasig-city-museum/06.jpg', 'current', 5),
  ('a1e10001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/pasig-city-museum/07.jpg', 'current', 6),

  ('a1e10002-0002-4c1a-9c1a-000000000002', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/immaculate-conception-cathedral/01.jpg', 'current', 0),
  ('a1e10002-0002-4c1a-9c1a-000000000002', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/immaculate-conception-cathedral/02.jpg', 'current', 1),
  ('a1e10002-0002-4c1a-9c1a-000000000002', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/immaculate-conception-cathedral/03.jpg', 'current', 2),
  ('a1e10002-0002-4c1a-9c1a-000000000002', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/immaculate-conception-cathedral/04.png', 'current', 3),

  ('a1e10003-0003-4c1a-9c1a-000000000003', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/bahay-na-tisa/01.jpg', 'current', 0),
  ('a1e10003-0003-4c1a-9c1a-000000000003', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/bahay-na-tisa/02.jpg', 'current', 1),
  ('a1e10003-0003-4c1a-9c1a-000000000003', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/bahay-na-tisa/03.png', 'current', 2),

  ('a1e10004-0004-4c1a-9c1a-000000000004', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/plaza-rizal-bitukang-manok/01.jpg', 'current', 0),
  ('a1e10004-0004-4c1a-9c1a-000000000004', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/plaza-rizal-bitukang-manok/02.jpg', 'current', 1),
  ('a1e10004-0004-4c1a-9c1a-000000000004', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/plaza-rizal-bitukang-manok/03.jpg', 'current', 2),
  ('a1e10004-0004-4c1a-9c1a-000000000004', ':SUPABASE_URL/storage/v1/object/public/content-photos/places/plaza-rizal-bitukang-manok/04.jpg', 'current', 3);
  -- Youth Development Center intentionally has no photos: storage-manifest.md
  -- notes none were supplied for it, matching its places/youth-development-center/
  -- path being left empty.

-- -----------------------------------------------------------------------------
-- 5. Place reviews — audit log per admin-panel-spec.md's "Review Action Log"
-- -----------------------------------------------------------------------------
-- One entry per verify/reject already reflected in places.verification_status
-- above, plus extra history rows on a couple of places to show the log
-- holding more than one entry over time (e.g. a re-review), matching
-- admin-panel-spec.md: "the full history stays visible for accountability."
-- reviewed_type/reviewed_id replaced place_id in migration 0014 (widened to
-- also cover discovery_content reviews). Every row below reviews a place,
-- so reviewed_type is 'place' throughout, reviewed_id carries the old
-- place_id value, same backfill 0014 itself did for pre-existing rows.
insert into public.place_reviews (reviewed_type, reviewed_id, staff_id, action, notes, created_at) values
  ('place', 'a1e10001-0001-4c1a-9c1a-000000000001', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'verify', 'CATO-submitted heritage content, cross-checked against NHCP and Wikipedia references.', now() - interval '5 days'),
  ('place', 'a1e10002-0002-4c1a-9c1a-000000000002', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'verify', 'CATO-submitted heritage content, cross-checked against Diocese of Pasig and NHCP references.', now() - interval '5 days'),
  ('place', 'a1e10003-0003-4c1a-9c1a-000000000003', 'ab395d2b-a446-4892-b43f-2170af876c8a', 'verify', 'CATO-submitted heritage content, cross-checked against Tech family and NHCP records.', now() - interval '5 days'),
  ('place', 'a1e10004-0004-4c1a-9c1a-000000000004', 'ab395d2b-a446-4892-b43f-2170af876c8a', 'verify', 'CATO-submitted heritage content, cross-checked against NHCP marker text.', now() - interval '5 days'),
  ('place', 'a1e10005-0005-4c1a-9c1a-000000000005', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'verify', 'Added per open-questions.md #7 as the related Place for the Creative Arts Academy workshop event.', now() - interval '2 days');

commit;

begin;

-- -----------------------------------------------------------------------------
-- 5.5 Business categories — migration 0027 left this table empty on purpose
--     (businesses.category was never a fixed list to backfill from), so
--     unlike place_categories/trail_categories/event_categories this list
--     exists only if seeded here. Trimmed to the 2 categories the 3 real
--     businesses below actually use (Food Stall for the bakery, Restaurant
--     for the two panciterias/restaurants), rather than carrying over the
--     original 7-category demo list. Icons per business-category-icons.ts's
--     shortlist.
-- -----------------------------------------------------------------------------
insert into public.business_categories (name, icon, sort_order) values
  ('Restaurant', 'utensils', 1),
  ('Food Stall', 'utensils', 2);

-- -----------------------------------------------------------------------------
-- 6. Businesses (3) — real CATO-submitted heritage businesses, replacing
--    the original 8 sample "Demo ..." rows per content-replacement-plan.md.
--    All 3 verified, same reasoning as Places above. submitted_by points
--    at a vendor's profiles.id from section 1/2 (demo accounts standing in
--    for these real vendors until real vendor accounts exist — no vendor
--    signup information was submitted alongside the business content
--    itself). registered_or_informal defaults to 'registered': all 3 are
--    long-established, named commercial establishments with public
--    storefronts, not informal stalls.
-- -----------------------------------------------------------------------------
-- Column list matches the current businesses schema after migration 0027
-- (category renamed to category_text_legacy, kept as the original free
-- text so nothing entered before that migration is lost, plus a new
-- nullable category_id resolved here against the business_categories rows
-- seeded directly above).

insert into public.businesses (
  id, name, business_type, category_text_legacy, category_id, description, address, latitude, longitude,
  contact, opening_hours, business_story, unique_specialty, accessibility_info,
  social_media_links, verification_status, reviewed_by, review_notes,
  featured_status, submitted_by, registered_or_informal, views_count, saves_count,
  updated_at
) values
  ('b2e20001-0001-4c1a-9c1a-000000000001', 'Panaderia Dimas-Alang', 'Product', 'Food Stall',
   (select id from public.business_categories where name = 'Food Stall'),
   'The oldest operating bakery in Pasig City, offering traditional wood-fired-style breads and century-old Filipino pastry recipes.',
   '52 A. Mabini St., Brgy. Kapasigan, Pasig City, 1600 Metro Manila', 14.5747, 121.0723,
   '+63 2 8641 0408', '9:00 AM – 6:00 PM, Monday to Sunday',
   'Established in 1919 by Teresa Raymundo and Ambrosio Lozada, the bakeshop took its name from Dimas-Alang, the revolutionary nom de plume of Dr. José Rizal. Managing operations through World War II and urban modernization, the Lozada family has preserved early 20th-century Filipino artisanal baking methods across four generations.',
   'Heirloom heritage pastries including Pan de San Nicolas, Aglipay, Biscocho de Caña, and Hindi Ko Akalain.',
   'Ground-floor street entry, flat sidewalk access, street parking available nearby.',
   array['https://www.facebook.com/PanaderiaDimasalang1919'], 'verified',
   'fed52550-3ee1-48da-b033-211f6245fbb6', 'CATO-submitted, address and contact confirmed against the business''s own Facebook page.',
   'featured', 'a77bf9f3-1107-4e9e-9677-ebbcaa662cba', 'registered', 0, 0, now() - interval '5 days'),

  -- Address corrected per open-questions.md #4: submitted address (10 East
  -- Capitol Dr.) was the pre-2020 location; current, web-search-verified
  -- address is 136 West Capitol Drive. Phone carried over unchanged.
  ('b2e20002-0002-4c1a-9c1a-000000000002', 'Three Sisters'' Restaurant of Pasig', 'Service', 'Restaurant',
   (select id from public.business_categories where name = 'Restaurant'),
   'A landmark dining establishment serving classic Filipino comfort food and heritage recipes continuously since 1941.',
   '136 West Capitol Drive, Brgy. Kapitolyo, Pasig City, 1603 Metro Manila', 14.5715, 121.0573,
   '(02) 631-9247 / +63 917 636 2134', '10:00 AM – 9:00 PM, Monday to Sunday',
   'Founded in 1941 by Rosa "Lola Rosa" Pike as Three Sisters'' Refreshment Parlor, the eatery originally gained popularity for its halo-halo and noodle dishes. Rebuilding after World War II, it expanded into a full-service Filipino restaurant renowned for preserving mid-century home-style recipes across generations.',
   'Signature sweet-savory Pork Barbecue, Pancit Bihon, and traditional Halo-Halo.',
   'Ground-floor dining access, wheelchair-accessible seating options, customer parking space.',
   array['https://www.facebook.com/profile.php?id=100080226190377', 'https://www.instagram.com/threesisterspasig/'],
   'verified', 'fed52550-3ee1-48da-b033-211f6245fbb6',
   'CATO-submitted; address corrected from the outdated East Capitol Drive location to the current West Capitol Drive address per web search verification (Instagram, most recent).',
   'featured', 'fd00f3e8-88bf-4536-96af-86a764856066', 'registered', 0, 0, now() - interval '5 days'),

  ('b2e20003-0003-4c1a-9c1a-000000000003', 'Ado''s Panciteria', 'Service', 'Restaurant',
   (select id from public.business_categories where name = 'Restaurant'),
   'A historic neighborhood noodle house delivering authentic Pasig-style pancit dishes and local comfort meals since 1952.',
   '126 A. Luna St. cor. R. Jabson St., Brgy. Malinao, Pasig City, 1600 Metro Manila', 14.5586, 121.0765,
   '+63 966 882 1759', '6:30 AM – 10:00 PM, Monday to Sunday',
   'Founded in 1952 by local barber-turned-cook Ado, the panciteria originated near the historic town square of Pasig. Built on affordable, flavorful noodle dishes, it grew from a simple neighborhood counter into a beloved culinary institution frequented by generations of Pasigueños.',
   'Pasig-style Pancit Bihon and Pancit Canton topped with toasted garlic and savory pork bits.',
   'Street-level entry, accessible ground-floor dining tables, limited street parking along A. Luna Street.',
   array['https://www.facebook.com/theoriginaladospanciteria'], 'verified',
   'fed52550-3ee1-48da-b033-211f6245fbb6', 'CATO-submitted, address and contact confirmed against public business listings.',
   'listed', '1f73e1d0-9eaa-498e-a19d-d6b07b02e9d0', 'registered', 0, 0, now() - interval '5 days');

-- -----------------------------------------------------------------------------
-- 7. Business items — real menu items and prices, researched via web
--    search (business review sites, menu-price aggregators, the
--    businesses' own social pages) since NEW_DATA.md gave only a per-
--    person price range per business, not an itemized menu. This is
--    prototype-quality content to demo for CATO, not CATO-confirmed data —
--    flagged for the official itemized menu/price list to replace this
--    on the next real content pass. Sources: Wanderlog (Panaderia
--    Dimas-Alang), imenuph.com (Three Sisters'), Booky/blogspot menu
--    listing (Ado's Panciteria).
-- -----------------------------------------------------------------------------
insert into public.business_items (business_id, name, price) values
  -- Panaderia Dimas-Alang
  ('b2e20001-0001-4c1a-9c1a-000000000001', 'Bonete (piece)', 3.00),
  ('b2e20001-0001-4c1a-9c1a-000000000001', 'Spanish Bread (piece)', 10.00),
  ('b2e20001-0001-4c1a-9c1a-000000000001', 'Hindi Ko Akalain (piece)', 15.00),
  ('b2e20001-0001-4c1a-9c1a-000000000001', 'Brazo de Mercedes (half roll)', 225.00),
  ('b2e20001-0001-4c1a-9c1a-000000000001', 'Ensaymada', null),

  -- Three Sisters' Restaurant of Pasig
  ('b2e20002-0002-4c1a-9c1a-000000000002', 'Regular Pork BBQ', 35.00),
  ('b2e20002-0002-4c1a-9c1a-000000000002', 'Special Pork BBQ', 55.00),
  ('b2e20002-0002-4c1a-9c1a-000000000002', 'Pancit Bihon (solo)', 110.00),
  ('b2e20002-0002-4c1a-9c1a-000000000002', 'Crispy Pata (good for 4)', 495.00),
  ('b2e20002-0002-4c1a-9c1a-000000000002', 'Halo-Halo Special', 110.00),

  -- Ado's Panciteria
  ('b2e20003-0003-4c1a-9c1a-000000000003', 'Bihon Guisado', 75.00),
  ('b2e20003-0003-4c1a-9c1a-000000000003', 'Canton Guisado', 92.00),
  ('b2e20003-0003-4c1a-9c1a-000000000003', 'Lomi Special', 105.00),
  ('b2e20003-0003-4c1a-9c1a-000000000003', 'Lumpiang Shanghai', null);

-- -----------------------------------------------------------------------------
-- 8. Business photos — real Pasig photography per storage-manifest.md,
--    same content-photos bucket and upload caveat as section 4 above.
-- -----------------------------------------------------------------------------
insert into public.business_photos (business_id, photo_url, sort_order) values
  ('b2e20001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/panaderia-dimas-alang/01.jpg', 0),
  ('b2e20001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/panaderia-dimas-alang/02.jpg', 1),
  ('b2e20001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/panaderia-dimas-alang/03.jpg', 2),
  ('b2e20001-0001-4c1a-9c1a-000000000001', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/panaderia-dimas-alang/04.png', 3),

  ('b2e20002-0002-4c1a-9c1a-000000000002', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/three-sisters-restaurant/01.jpg', 0),
  ('b2e20002-0002-4c1a-9c1a-000000000002', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/three-sisters-restaurant/02.jpg', 1),
  ('b2e20002-0002-4c1a-9c1a-000000000002', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/three-sisters-restaurant/03.jpg', 2),
  ('b2e20002-0002-4c1a-9c1a-000000000002', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/three-sisters-restaurant/04.jpg', 3),
  ('b2e20002-0002-4c1a-9c1a-000000000002', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/three-sisters-restaurant/05.jpg', 4),

  ('b2e20003-0003-4c1a-9c1a-000000000003', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/ados-panciteria/01.jpg', 0),
  ('b2e20003-0003-4c1a-9c1a-000000000003', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/ados-panciteria/02.jpg', 1),
  ('b2e20003-0003-4c1a-9c1a-000000000003', ':SUPABASE_URL/storage/v1/object/public/content-photos/businesses/ados-panciteria/03.jpg', 2);

-- -----------------------------------------------------------------------------
-- 9. Business reviews — audit log, mirrors place_reviews. Two of the three
--    real businesses are featured (see section 6), so those carry a
--    'feature' action per admin-panel-spec.md's Featured status toggle.
-- -----------------------------------------------------------------------------
insert into public.business_reviews (business_id, staff_id, action, notes, created_at) values
  ('b2e20001-0001-4c1a-9c1a-000000000001', 'fed52550-3ee1-48da-b033-211f6245fbb6', 'verify', 'CATO-submitted, address and contact confirmed.', now() - interval '5 days'),
  ('b2e20001-0001-4c1a-9c1a-000000000001', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'feature', 'Oldest operating bakery in Pasig, strong heritage-walk anchor point.', now() - interval '5 days'),
  ('b2e20002-0002-4c1a-9c1a-000000000002', 'fed52550-3ee1-48da-b033-211f6245fbb6', 'verify', 'CATO-submitted; address corrected to current West Capitol Drive location per web search.', now() - interval '5 days'),
  ('b2e20002-0002-4c1a-9c1a-000000000002', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'feature', 'Landmark Kapitolyo dining spot, continuous operation since 1941.', now() - interval '5 days'),
  ('b2e20003-0003-4c1a-9c1a-000000000003', 'fed52550-3ee1-48da-b033-211f6245fbb6', 'verify', 'CATO-submitted, address and contact confirmed.', now() - interval '5 days');

-- -----------------------------------------------------------------------------
-- 10. Business flags — no rows. The original sample flags (a system-
--     generated second-listing flag, a user-submitted photo report) were
--     demo scenarios against the removed sample businesses, and no real
--     flag scenario was submitted for the 3 real businesses above. Left
--     empty rather than inventing a flag scenario against real, verified
--     CATO businesses; revisit once a real flag/report case exists to
--     seed, or once vendor-mode-spec.md's flag flows need exercising
--     again for a demo.
-- -----------------------------------------------------------------------------

commit;

begin;

-- -----------------------------------------------------------------------------
-- 11-15. Routes/Trails and dependent personal records — INTENTIONALLY EMPTY.
--
--     Resolved per open-questions.md #8 (resume-plan.md's blocking
--     question): no real Routes/Trails data has been submitted alongside
--     the real Places/Businesses/Events content above. The original
--     sample Routes (3), route_stops, discovery_content, and
--     trail_credentials all referenced sample Place/Business rows that
--     are now removed, and the sample personal-record rows
--     (completed_routes, user_credentials, saved_routes, saved_places)
--     referenced those same sample route/place IDs. All of it was fake
--     demo data with no real counterpart to replace it with, so per the
--     confirmed decision it is dropped entirely rather than either (a)
--     inventing placeholder trails over now-real Place/Business content,
--     or (b) leaving rows that reference deleted sample IDs.
--
--     Tables left empty by this: routes, route_stops, discovery_content,
--     trail_credentials, completed_routes, user_credentials, saved_routes,
--     saved_places. All still exist per their migrations (0005, 0007) and
--     still enforce their RLS policies; they simply have no seed rows
--     until real Trail/Route data is submitted. The Trails feature area
--     of the app will show its genuine empty state against this seed,
--     which is accurate: there is no real Trail content yet, not a
--     seeding gap to paper over.
--
--     To resume: once real Routes/Trails data arrives (stops in sequence,
--     theme, estimated duration/budget, run type, any Discovery content,
--     credential name/requirement per data-model.md's field list), add an
--     insert for public.routes here, following the same category_id
--     subquery pattern places/businesses/events use above, then
--     route_stops referencing the real place/business ids from sections 3
--     and 6, then discovery_content and trail_credentials as needed.
--     Personal-record rows (completed_routes, user_credentials,
--     saved_routes) only make sense once real routes exist to reference;
--     saved_places can be seeded independently against the real place ids
--     in section 3 whenever real save data exists to seed.
-- -----------------------------------------------------------------------------

commit;

begin;

-- -----------------------------------------------------------------------------
-- 16. Events & Announcements (3) — real CATO announcements, replacing the
--     original 6 sample "Demo ..." rows per content-replacement-plan.md.
--     All 3 dated in 2026 and already past relative to this seed file's
--     "today" (see date_time/end_date_time below), so lifecycle_status is
--     'past' throughout — an accurate reflection of the real submitted
--     dates, not a demo variety requirement. category_id resolves against
--     the 3 new event_categories rows migration 0032 added (Cultural &
--     Heritage, Youth & Education, Arts & Culture), matching each
--     announcement's real category from NEW_DATA.md. Column list matches
--     the current events schema after migration 0024 (category text ->
--     category_id, references event_categories) plus migration 0020's
--     end_date_time.
-- -----------------------------------------------------------------------------
insert into public.events (
  id, title, description, category_id, related_program, date_time, end_date_time,
  location, related_place_id, enrollment_info, posted_by, lifecycle_status, published,
  updated_at
) values
  ('c3e30001-0001-4c1a-9c1a-000000000001', 'Pasig Heritage & Gastronomic Walking Tour 2026',
   'Inaanyayahan ng Pamahalaang Lungsod ng Pasig, sa pamamagitan ng Cultural Affairs and Tourism Office (CATO), ang lahat ng Pasigueño na lumahok sa ating 2026 Heritage & Gastronomic Walking Tour. Tuklasin ang mayamang pamana, arkitektura, at natatanging kulinarya ng Poblacion! Kabilang sa tour ang pagbisita sa Pasig City Museum, Bahay na Tisa, at Immaculate Conception Cathedral.',
   (select id from public.event_categories where name = 'Cultural & Heritage'), 'National Heritage Month Celebration',
   '2026-05-24 07:00:00+08', '2026-05-24 11:30:00+08', 'Plaza Rizal, Brgy. San Jose, Pasig City',
   'a1e10004-0004-4c1a-9c1a-000000000004',
   '50 slots available. Free entry on a first-come, first-served basis for Pasig residents aged 15 and above. Register at bit.ly/PasigTour2026.',
   'e283c6fb-4dcd-455f-a60c-e35add77a330', 'past', true, now() - interval '5 days'),

  ('c3e30002-0002-4c1a-9c1a-000000000002', 'Pasig Creative Arts Academy: Summer Youth Workshops',
   'Free summer creative workshops for Pasigueño youth offering modules in Visual Arts & Painting, Performing Arts & Theater, and Traditional Crafts. Organized under CATO pursuant to Executive Order No. PCG-20, Series of 2026. Materials will be provided free of charge for all accepted participants.',
   (select id from public.event_categories where name = 'Youth & Education'), 'Pasig Creative Arts Academy',
   '2026-06-15 09:00:00+08', '2026-07-20 16:00:00+08', 'Youth Development Center Hall, Pasig City Hall Complex',
   'a1e10005-0005-4c1a-9c1a-000000000005',
   'Open to Pasig residents aged 10–24. Requires valid Pasig Resident ID and parental consent form. Registration deadline: June 5, 2026.',
   'e283c6fb-4dcd-455f-a60c-e35add77a330', 'past', true, now() - interval '5 days'),

  ('c3e30003-0003-4c1a-9c1a-000000000003', 'LikhaFest: Pasig City Arts & Crafts Fair 2026',
   'A two-day arts fair held in celebration of National Arts Month. Showcasing local Pasigueño artisans, micro-entrepreneurs, live painting performances, and musical acts to celebrate homegrown talent and community creativity.',
   (select id from public.event_categories where name = 'Arts & Culture'), 'National Arts Month Celebration',
   '2026-02-26 10:00:00+08', '2026-02-27 20:00:00+08', 'Plaza Rizal Grounds, Brgy. San Jose, Pasig City',
   'a1e10004-0004-4c1a-9c1a-000000000004',
   'Walk-ins welcome; no pre-registration required for attendees. Exhibitor slots full.',
   'e283c6fb-4dcd-455f-a60c-e35add77a330', 'past', true, now() - interval '5 days');

-- -----------------------------------------------------------------------------
-- 8. Landing slides — landing-hero-phases.md Phase 3.15.
-- -----------------------------------------------------------------------------
-- Per decision-log.md entry #17 ("real sourced content or a comment saying
-- what it is"): these two point at the same real, already-uploaded Pasig
-- City Museum and Immaculate Conception Cathedral photography used by
-- section 4's place_photos above, under the landing/ prefix's sibling
-- places/ path -- not new files, and not picsum.photos placeholders. No
-- separate landing/ uploads exist yet, so the hero reuses CATO's own
-- verified photography rather than inventing a placeholder image just to
-- have two rows.
insert into public.landing_slides (image_url, caption, sort_order, active) values
  (':SUPABASE_URL/storage/v1/object/public/content-photos/places/pasig-city-museum/01.jpg',
   'Discover the stories behind Pasig City Museum', 0, true),
  (':SUPABASE_URL/storage/v1/object/public/content-photos/places/immaculate-conception-cathedral/01.jpg',
   'Walk through centuries of Pasigueño heritage', 1, true);

commit;
