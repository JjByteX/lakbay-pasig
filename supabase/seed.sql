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
-- Content spans every verification_status, featured_status, published/draft,
-- and lifecycle_status value so every admin list/filter/badge has something
-- to render, plus deliberately varied business_flags / business_photos /
-- account ages so src/lib/business-queue-priority.ts has real signals to
-- sort on instead of an empty table.
--
-- Photos use https://picsum.photos/seed/<slug>/<w>/<h>, a public placeholder
-- image service, not real Pasig photography — this is data seeding, not an
-- asset pipeline, and the real photos are a CATO content task per
-- docs/feature-scope-changes.md's "Resolved After Meeting With CATO" section.
--
-- Extended beyond the original Places/Profiles pass to cover every table in
-- migrations 0001-0010: Businesses (with items, photos, flags, and review
-- log), Place review log, Routes/Trails with stops and Discovery content,
-- Events, Trail credentials, and the personal-record tables (saved places,
-- saved routes, completed routes, earned credentials), so every admin list,
-- filter, badge, and RLS-gated read in the current src/ tree has real rows
-- to render against, not an empty state everywhere except Places.
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
-- crypt(...) matches the bcrypt format GoTrue expects for encrypted_password.
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
  ('00000000-0000-0000-0000-000000000000', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'authenticated', 'authenticated', 'admin1@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '220 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'ab395d2b-a446-4892-b43f-2170af876c8a', 'authenticated', 'authenticated', 'admin2@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '190 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),

  -- CATO Staff — Staff (4)
  ('00000000-0000-0000-0000-000000000000', '6456adca-58a3-48c3-b0e6-6a086d03734f', 'authenticated', 'authenticated', 'staff.places@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '150 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fed52550-3ee1-48da-b033-211f6245fbb6', 'authenticated', 'authenticated', 'staff.business@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '130 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e283c6fb-4dcd-455f-a60c-e35add77a330', 'authenticated', 'authenticated', 'staff.events@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '95 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '9756f8d7-2a8e-4bd8-8669-0eac163096c6', 'authenticated', 'authenticated', 'staff.new@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '5 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),

  -- Registered Users, no business (6)
  ('00000000-0000-0000-0000-000000000000', 'ed8d4b57-6a77-418b-9db3-11c18e18fbca', 'authenticated', 'authenticated', 'resident1@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '300 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '75486d5a-d222-4853-8046-8a55199c6208', 'authenticated', 'authenticated', 'resident2@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '260 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e927ff41-bff8-43f0-9c1f-98fcaa54793d', 'authenticated', 'authenticated', 'resident3@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '200 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'db860542-f964-4290-a8f4-72c58c0dfff3', 'authenticated', 'authenticated', 'resident4@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '140 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c5a73b63-20bd-4310-9515-3f22fa9dd40c', 'authenticated', 'authenticated', 'resident5@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '60 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '62acb632-8642-4b55-86ac-dfdee7f1d953', 'authenticated', 'authenticated', 'resident6@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '10 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),

  -- Vendors — Registered Users who also hold a business (6). Ages vary on
  -- purpose: some old (established vendor), some brand new (the "new
  -- account" business-queue-priority.ts signal, 30 day window).
  ('00000000-0000-0000-0000-000000000000', 'a77bf9f3-1107-4e9e-9677-ebbcaa662cba', 'authenticated', 'authenticated', 'vendor1@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '400 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'fd00f3e8-88bf-4536-96af-86a764856066', 'authenticated', 'authenticated', 'vendor2@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '320 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '1f73e1d0-9eaa-498e-a19d-d6b07b02e9d0', 'authenticated', 'authenticated', 'vendor3@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '250 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '813367e0-97dc-442c-9511-0e6c506c0883', 'authenticated', 'authenticated', 'vendor4@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '45 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '66c28540-f93a-48e2-aaa3-792f34b84491', 'authenticated', 'authenticated', 'vendor5@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '3 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '3541db59-0c27-4324-b685-eb66de017874', 'authenticated', 'authenticated', 'vendor6@lakbay-demo.local', crypt('Demo!Password123', gen_salt('bf')), now(), now() - interval '1 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '');

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

-- 2.3 Residents (no business)
update public.profiles set
  display_name = 'Demo Resident One', contact_number = '+639180000001',
  date_of_birth = '1998-03-14', preferred_language = 'English',
  preferred_categories = array['Heritage Site', 'Museum']
where id = 'ed8d4b57-6a77-418b-9db3-11c18e18fbca';

update public.profiles set
  display_name = 'Demo Resident Two', contact_number = '+639180000002',
  date_of_birth = '1995-07-22', preferred_language = 'Filipino',
  preferred_categories = array['Church', 'Monument']
where id = '75486d5a-d222-4853-8046-8a55199c6208';

update public.profiles set
  display_name = 'Demo Resident Three', contact_number = '+639180000003',
  date_of_birth = '2002-11-02', preferred_language = 'Both',
  preferred_categories = array['Cultural Site']
where id = 'e927ff41-bff8-43f0-9c1f-98fcaa54793d';

update public.profiles set
  display_name = 'Demo Resident Four', contact_number = '+639180000004',
  date_of_birth = '1990-01-30', preferred_language = 'English',
  preferred_categories = array['Heritage Site', 'Church']
where id = 'db860542-f964-4290-a8f4-72c58c0dfff3';

update public.profiles set
  display_name = 'Demo Resident Five', contact_number = '+639180000005',
  date_of_birth = '1988-09-09', preferred_language = 'Filipino',
  preferred_categories = array['Museum']
where id = 'c5a73b63-20bd-4310-9515-3f22fa9dd40c';

update public.profiles set
  display_name = 'Demo Resident Six', contact_number = '+639180000006',
  date_of_birth = '2004-05-18', preferred_language = 'English',
  preferred_categories = array['Cultural Site', 'Monument']
where id = '62acb632-8642-4b55-86ac-dfdee7f1d953';

-- 2.4 Vendors — still role='resident', per vendor-mode-spec.md: "Vendor is
-- not a separate account type. It is a mode switch on a Registered User
-- account." The businesses table (section 5) is what actually makes each of
-- these a vendor.
update public.profiles set
  display_name = 'Demo Vendor One', contact_number = '+639190000001',
  date_of_birth = '1985-02-11', preferred_language = 'English'
where id = 'a77bf9f3-1107-4e9e-9677-ebbcaa662cba';

update public.profiles set
  display_name = 'Demo Vendor Two', contact_number = '+639190000002',
  date_of_birth = '1979-06-25', preferred_language = 'Filipino'
where id = 'fd00f3e8-88bf-4536-96af-86a764856066';

update public.profiles set
  display_name = 'Demo Vendor Three', contact_number = '+639190000003',
  date_of_birth = '1993-12-08', preferred_language = 'Both'
where id = '1f73e1d0-9eaa-498e-a19d-d6b07b02e9d0';

update public.profiles set
  display_name = 'Demo Vendor Four', contact_number = '+639190000004',
  date_of_birth = '1997-04-19', preferred_language = 'English'
where id = '813367e0-97dc-442c-9511-0e6c506c0883';

update public.profiles set
  display_name = 'Demo Vendor Five', contact_number = '+639190000005',
  date_of_birth = '2000-08-27', preferred_language = 'Filipino'
where id = '66c28540-f93a-48e2-aaa3-792f34b84491';

update public.profiles set
  display_name = 'Demo Vendor Six', contact_number = '+639190000006',
  date_of_birth = '1991-10-03', preferred_language = 'English'
where id = '3541db59-0c27-4324-b685-eb66de017874';

commit;

begin;

-- -----------------------------------------------------------------------------
-- 3. Places (10) — spans pending / verified / rejected, all 5 categories
-- -----------------------------------------------------------------------------
-- Column list matches migration 0003_places.sql exactly. reviewed_by is only
-- set where verification_status is verified or rejected, mirroring how the
-- real review flow in admin-place-detail.tsx only sets it on a review action
-- (see place_reviews in section 8, which logs the same action).

insert into public.places (
  id, name, category, description, historical_background, historical_significance,
  year_or_period, source_reference, address, latitude, longitude, operating_hours,
  entrance_fee, visit_duration, accessibility_info, facilities, nearby_places,
  language, verification_status, reviewed_by, updated_at
) values
  ('6bce5398-b23e-4611-87e8-3747ea370bc4', 'Demo Heritage House', 'Heritage Site',
   'A restored ancestral house open for guided walk-throughs.',
   'Built in the early twentieth century by a local trading family, later used as a wartime billet before being restored as a heritage exhibit.',
   'One of the few remaining examples of pre-war residential architecture in the area, illustrating domestic life of the period.',
   'Early 1900s', 'CATO heritage archive, oral history interviews (2019)',
   '123 Demo Heritage Street, Pasig City', 14.5764, 121.0851,
   '9:00 AM - 5:00 PM, Tuesday to Sunday', 'Free', '45 minutes',
   'Ground floor wheelchair accessible, second floor stairs only',
   array['restrooms', 'info desk'], 'Near Demo Plaza and Demo Riverside Walk',
   'Both', 'verified', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', now() - interval '12 days'),

  ('f1b5f1df-d6a2-44b3-8997-8aa4920ae693', 'Demo Riverside Walk', 'Cultural Site',
   'A landscaped riverside promenade used for community events and evening walks.',
   'Developed as part of a river rehabilitation program, incorporating public art installations from local artists.',
   'Represents the city''s ongoing river cleanup and public space revival efforts.',
   '2015', 'City Planning Office records',
   '45 Demo Riverside Avenue, Pasig City', 14.5731, 121.0899,
   'Open 24 hours', 'Free', '30 minutes',
   'Fully paved, wheelchair accessible', array['restrooms', 'parking', 'waiting area'],
   'Near Demo Heritage House', 'English', 'verified', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', now() - interval '20 days'),

  ('84125a2b-7501-4251-8b5d-c0d6c5edaa5c', 'Demo Parish Church', 'Church',
   'A working parish church known for its preserved retablo and bell tower.',
   'Construction began under Spanish colonial administration and continued through several rectors, with the bell tower added later.',
   'Listed as a point of interest for its retablo craftsmanship and continuous use since construction.',
   '1780s', 'Archdiocesan parish records',
   '8 Demo Church Square, Pasig City', 14.5700, 121.0825,
   '6:00 AM - 7:00 PM daily', 'Free', '20 minutes',
   'Main entrance ramp available', array['restrooms', 'parking'],
   'Near Demo Public Market', 'Filipino', 'verified', 'ab395d2b-a446-4892-b43f-2170af876c8a', now() - interval '35 days'),

  ('290fe466-9327-4660-9766-a2c64cdf078d', 'Demo City Museum', 'Museum',
   'A small municipal museum covering local trade history and everyday artifacts.',
   'Founded from a donated private collection, later expanded with pieces recovered during infrastructure excavation projects.',
   'Serves as the city''s primary repository of everyday material culture, not just ceremonial artifacts.',
   '1998', 'CATO museum accession log',
   '77 Demo Museum Road, Pasig City', 14.5690, 121.0790,
   '9:00 AM - 4:00 PM, Wednesday to Sunday', 'PHP 50', '1 hour',
   'Elevator available, wheelchair accessible', array['restrooms', 'info desk', 'parking'],
   'Near Demo City Hall', 'Both', 'verified', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', now() - interval '8 days'),

  ('3610bb1f-bbbe-48db-a77a-17c2632eabb0', 'Demo War Memorial', 'Monument',
   'A monument commemorating local residents lost during wartime occupation.',
   'Erected by a civic association two decades after the war, funded through community donations.',
   'One of the few monuments in the city naming individual residents rather than a generic dedication.',
   '1965', 'Civic association commemorative plaque',
   '30 Demo Memorial Park, Pasig City', 14.5745, 121.0860,
   'Open 24 hours', 'Free', '15 minutes',
   'Fully accessible, paved plaza', array['parking'],
   'Near Demo Riverside Walk', 'English', 'verified', 'ab395d2b-a446-4892-b43f-2170af876c8a', now() - interval '50 days'),

  ('5f1a1879-789b-4b24-84c8-72cceaf11dd3', 'Demo Old Bridge Marker', 'Monument',
   'A marker at the site of the city''s first permanent river crossing.',
   'Placed where the original bridge structure stood before being replaced by the current span.',
   'Documents an early piece of civic infrastructure central to the growth of trade in the area.',
   '1932', 'Public works historical registry',
   '2 Demo Old Bridge Street, Pasig City', 14.5712, 121.0871,
   'Open 24 hours', 'Free', '10 minutes',
   'Sidewalk level, accessible', array[]::text[],
   'Near Demo Riverside Walk', 'Filipino', 'pending', null, now() - interval '2 days'),

  ('f552df7f-30a7-42ab-b470-06968810f437', 'Demo Weaving Center', 'Cultural Site',
   'A community center preserving a local textile weaving tradition through workshops.',
   'Established by a cooperative of weaving families to keep the craft from disappearing as demand shifted to factory textiles.',
   'Active site of intangible cultural heritage, not a static exhibit.',
   '2010', 'Cooperative founding charter',
   '19 Demo Weavers Lane, Pasig City', 14.5678, 121.0803,
   '10:00 AM - 3:00 PM, Monday to Friday', 'Free to visit, workshop fees vary', '40 minutes',
   'Ground floor accessible', array['restrooms', 'info desk'],
   'Near Demo City Museum', 'Both', 'pending', null, now() - interval '1 days'),

  ('e551915e-15e5-41ed-9ca1-a71364da7028', 'Demo Chapel Ruins', 'Church',
   'The partial remains of an earlier chapel structure, preserved as a viewing site.',
   'Damaged beyond repair during a historic flood, the surviving foundation and wall fragments were later fenced and preserved rather than demolished.',
   'Illustrative of the area''s flood history and how earlier structures responded to it.',
   '1850s', 'Parish historical notes, CATO field survey (2021)',
   '5 Demo Chapel Path, Pasig City', 14.5721, 121.0838,
   '8:00 AM - 5:00 PM daily', 'Free', '15 minutes',
   'Uneven ground, limited accessibility', array[]::text[],
   'Near Demo Parish Church', 'English', 'rejected', 'ab395d2b-a446-4892-b43f-2170af876c8a', now() - interval '15 days'),

  ('56302e94-c04a-4e3e-8a2c-068d92e19298', 'Demo Artisan Plaza', 'Cultural Site',
   'A public plaza hosting rotating craft and food markets on weekends.',
   'Converted from a former parking lot into a pedestrian plaza as part of a downtown revitalization plan.',
   'Functions as the informal town square for cultural programming.',
   '2019', 'City Planning Office records',
   '60 Demo Plaza Center, Pasig City', 14.5705, 121.0845,
   'Open 24 hours, markets Saturday and Sunday', 'Free', '30 minutes',
   'Fully paved, wheelchair accessible', array['restrooms', 'parking', 'waiting area'],
   'Near Demo Heritage House', 'Both', 'verified', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', now() - interval '6 days'),

  ('ffa2feac-e3cf-437d-b285-20a9dd55d11b', 'Demo Watchtower Site', 'Monument',
   'The foundation remnants of a colonial-era watchtower overlooking the river bend.',
   'Built to monitor river traffic, decommissioned once the function became obsolete, left as a ruin rather than restored.',
   'A rare surviving example of colonial-period river surveillance infrastructure in the city.',
   '1790s', 'CATO field survey (2022)',
   '11 Demo Watchtower Rise, Pasig City', 14.5688, 121.0912,
   'Open 24 hours', 'Free', '20 minutes',
   'Steep unpaved path, not wheelchair accessible', array[]::text[],
   'Near Demo Riverside Walk', 'English', 'pending', null, now() - interval '4 days');

-- -----------------------------------------------------------------------------
-- 4. Place photos — historical + current, at least one place with none
-- -----------------------------------------------------------------------------
insert into public.place_photos (place_id, photo_url, photo_type, sort_order) values
  ('6bce5398-b23e-4611-87e8-3747ea370bc4', 'https://picsum.photos/seed/demo-heritage-house-hist/800/600', 'historical', 0),
  ('6bce5398-b23e-4611-87e8-3747ea370bc4', 'https://picsum.photos/seed/demo-heritage-house-cur/800/600', 'current', 0),
  ('f1b5f1df-d6a2-44b3-8997-8aa4920ae693', 'https://picsum.photos/seed/demo-riverside-cur1/800/600', 'current', 0),
  ('f1b5f1df-d6a2-44b3-8997-8aa4920ae693', 'https://picsum.photos/seed/demo-riverside-cur2/800/600', 'current', 1),
  ('84125a2b-7501-4251-8b5d-c0d6c5edaa5c', 'https://picsum.photos/seed/demo-parish-hist/800/600', 'historical', 0),
  ('84125a2b-7501-4251-8b5d-c0d6c5edaa5c', 'https://picsum.photos/seed/demo-parish-cur/800/600', 'current', 0),
  ('290fe466-9327-4660-9766-a2c64cdf078d', 'https://picsum.photos/seed/demo-museum-cur/800/600', 'current', 0),
  ('3610bb1f-bbbe-48db-a77a-17c2632eabb0', 'https://picsum.photos/seed/demo-warmemorial-cur/800/600', 'current', 0),
  ('f552df7f-30a7-42ab-b470-06968810f437', 'https://picsum.photos/seed/demo-weaving-cur/800/600', 'current', 0),
  ('e551915e-15e5-41ed-9ca1-a71364da7028', 'https://picsum.photos/seed/demo-chapelruins-hist/800/600', 'historical', 0),
  ('56302e94-c04a-4e3e-8a2c-068d92e19298', 'https://picsum.photos/seed/demo-artisanplaza-cur/800/600', 'current', 0);
  -- Demo Old Bridge Marker and Demo Watchtower Site intentionally have no
  -- photos, both pending — a realistic incomplete submission state.

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
  ('place', '6bce5398-b23e-4611-87e8-3747ea370bc4', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'verify', null, now() - interval '12 days'),
  ('place', 'f1b5f1df-d6a2-44b3-8997-8aa4920ae693', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'reject', 'Address did not match Assessor''s Office records, please recheck before resubmitting.', now() - interval '25 days'),
  ('place', 'f1b5f1df-d6a2-44b3-8997-8aa4920ae693', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'verify', 'Address corrected, coordinates now match.', now() - interval '20 days'),
  ('place', '84125a2b-7501-4251-8b5d-c0d6c5edaa5c', 'ab395d2b-a446-4892-b43f-2170af876c8a', 'verify', null, now() - interval '35 days'),
  ('place', '290fe466-9327-4660-9766-a2c64cdf078d', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'verify', null, now() - interval '8 days'),
  ('place', '3610bb1f-bbbe-48db-a77a-17c2632eabb0', 'ab395d2b-a446-4892-b43f-2170af876c8a', 'verify', null, now() - interval '50 days'),
  ('place', 'e551915e-15e5-41ed-9ca1-a71364da7028', 'ab395d2b-a446-4892-b43f-2170af876c8a', 'reject', 'Source reference is a single parish note with no second source. Needs corroboration before this goes live.', now() - interval '15 days'),
  ('place', '56302e94-c04a-4e3e-8a2c-068d92e19298', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'verify', null, now() - interval '6 days');

commit;

begin;

-- -----------------------------------------------------------------------------
-- 6. Businesses (8) — spans pending/verified/unverified, listed/featured,
--    Product/Service/Both, registered/informal, and every
--    business-queue-priority.ts signal (new account, no photos, thin
--    description, copy-pasted description, multiple submissions).
-- -----------------------------------------------------------------------------
-- Column list matches migration 0004_businesses.sql exactly. submitted_by
-- always points at a vendor's profiles.id from section 1/2 above, never a
-- staff account — per vendor-mode-spec.md, "Vendor is not a separate account
-- type," any Registered User becomes one the moment they submit a business.

insert into public.businesses (
  id, name, business_type, category, description, address, latitude, longitude,
  contact, opening_hours, business_story, unique_specialty, accessibility_info,
  social_media_links, language, verification_status, reviewed_by, review_notes,
  featured_status, submitted_by, registered_or_informal, views_count, saves_count,
  updated_at
) values
  -- Established, verified, featured — vendor1 (400 days old)
  ('0af13835-fa0b-47e5-8ee7-8c87de9313d4', 'Demo Riverside Eatery', 'Product', 'Restaurant',
   'A family-run carinderia serving Pasig home-style dishes near the riverside promenade.',
   '14 Demo Market Street, Pasig City', 14.5733, 121.0891,
   '+639201234567', '10:00 AM - 8:00 PM daily',
   'Started as a single food stall in the old public market, moved to its current storefront after outgrowing the stall in its third year.',
   'Known for a decades-old sinigang recipe passed down within the family.',
   'Street level, no steps, informal parking along the street',
   array['https://facebook.com/demo-riverside-eatery'], 'Both', 'verified',
   'fed52550-3ee1-48da-b033-211f6245fbb6', null, 'featured',
   'a77bf9f3-1107-4e9e-9677-ebbcaa662cba', 'registered', 812, 156, now() - interval '18 days'),

  -- Verified, listed, informal — vendor2 (320 days old)
  ('6d28a284-ec7a-4da6-89f0-592dc04088e7', 'Demo Kakanin Corner', 'Product', 'Food Stall',
   'A small stall selling traditional rice cakes made fresh every morning.',
   '5 Demo Public Market, Pasig City', 14.5741, 121.0868,
   '+639201234568', '6:00 AM - 1:00 PM daily',
   'Run by a single vendor who learned the recipes from her mother, selling at the same market spot for over a decade.',
   'Uses a wood-fired steaming method most nearby stalls have switched away from.',
   'Market aisle stall, narrow but level', array[]::text[],
   'Filipino', 'verified', 'fed52550-3ee1-48da-b033-211f6245fbb6', null,
   'listed', 'fd00f3e8-88bf-4536-96af-86a764856066', 'informal', 340, 61, now() - interval '40 days'),

  -- Pending, thin description, one photo — vendor3 (250 days old)
  ('5ae1c60e-ddbb-4e03-a782-0b72023dc381', 'Demo Grill House', 'Product', 'Restaurant',
   'Grilled food.',
   '21 Demo Food Row, Pasig City', 14.5719, 121.0902,
   '+639201234569', '4:00 PM - 11:00 PM daily', null, null,
   'Ground floor, open-air seating', array[]::text[],
   'English', 'pending', null, null, 'listed',
   '1f73e1d0-9eaa-498e-a19d-d6b07b02e9d0', 'registered', 47, 5, now() - interval '3 days'),

  -- Verified, featured, service-type — vendor1's second listing (multipleSubmissions signal)
  ('0649beb4-36ed-4942-96ce-6b1107a51e2c', 'Demo Weaving Supplies', 'Both', 'Handicraft',
   'Sells woven textile pieces and offers short hands-on weaving demonstrations for visitors.',
   '19 Demo Weavers Lane, Pasig City', 14.5679, 121.0805,
   '+639201234570', '10:00 AM - 3:00 PM, Monday to Friday',
   'Opened by a former Demo Weaving Center apprentice to sell finished pieces directly to visitors after workshops.',
   'Only stall in the area selling handwoven pieces made on site, not sourced elsewhere.',
   'Ground floor, shares accessibility with Demo Weaving Center next door',
   array['https://facebook.com/demo-weaving-supplies', 'https://instagram.com/demo.weaving'],
   'Both', 'verified', 'fed52550-3ee1-48da-b033-211f6245fbb6', null, 'featured',
   'a77bf9f3-1107-4e9e-9677-ebbcaa662cba', 'informal', 265, 88, now() - interval '10 days'),

  -- Unverified (rejected-equivalent per 0004's check constraint) with review notes — vendor4 (45 days old)
  ('8925a576-e13a-4cc8-84d9-98f2477a5b39', 'Demo Souvenir Hub', 'Product', 'Souvenirs',
   'Souvenir shop selling keychains, shirts, and fridge magnets themed around the city.',
   '3 Demo Plaza Center, Pasig City', 14.5703, 121.0844,
   '+639201234571', '9:00 AM - 7:00 PM daily', null, null,
   'Street level entrance', array[]::text[], 'English', 'unverified',
   'fed52550-3ee1-48da-b033-211f6245fbb6',
   'Listing photos appear to be stock images, not the actual storefront. Please resubmit with real photos before this can be verified.',
   'listed', '813367e0-97dc-442c-9511-0e6c506c0883', 'registered', 22, 2, now() - interval '5 days'),

  -- Pending, new account, no photos, thin + copy-pasted description — vendor5 (3 days old)
  ('97548250-1019-48d5-9ae3-db9eef0555e1', 'Demo Print Services', 'Service', 'Printing',
   'Quality service for everyone.',
   '8 Demo Commerce Ave, Pasig City', 14.5695, 121.0857,
   '+639201234572', '8:00 AM - 6:00 PM, Monday to Saturday', null, null,
   null, array[]::text[], 'English', 'pending', null, null, 'listed',
   '66c28540-f93a-48e2-aaa3-792f34b84491', 'informal', 3, 0, now() - interval '3 days'),

  -- Pending, new account, no photos, thin + copy-pasted description (same
  -- text as above on purpose) — vendor6 (1 day old), plus a second listing
  -- below from the same account to trigger the multipleSubmissions signal.
  ('1a470f8e-da17-445b-9a06-05fef0dddca3', 'Demo Tailoring Services', 'Service', 'Tailoring',
   'Quality service for everyone.',
   '9 Demo Commerce Ave, Pasig City', 14.5696, 121.0858,
   '+639201234573', '9:00 AM - 6:00 PM, Monday to Saturday', null, null,
   null, array[]::text[], 'English', 'pending', null, null, 'listed',
   '3541db59-0c27-4324-b685-eb66de017874', 'informal', 1, 0, now() - interval '1 days'),

  ('13c73f2b-6101-4e89-a6ba-2639c048fcf8', 'Demo Repair Shop', 'Service', 'Repair',
   'Second listing from the same brand-new account, exercises the one-listing-flag-not-block rule from vendor-mode-spec.md.',
   '9 Demo Commerce Ave, Pasig City', 14.5696, 121.0859,
   '+639201234574', '9:00 AM - 6:00 PM, Monday to Saturday', null, null,
   null, array[]::text[], 'English', 'pending', null, null, 'listed',
   '3541db59-0c27-4324-b685-eb66de017874', 'informal', 0, 0, now() - interval '1 days');

-- -----------------------------------------------------------------------------
-- 7. Business items — price optional per vendor-mode-spec.md, at least one
--    item per business with a blank price to exercise the "missing price"
--    warning and dashboard count.
-- -----------------------------------------------------------------------------
insert into public.business_items (business_id, name, price) values
  ('0af13835-fa0b-47e5-8ee7-8c87de9313d4', 'Sinigang na Baboy (bowl)', 120.00),
  ('0af13835-fa0b-47e5-8ee7-8c87de9313d4', 'Grilled Bangus (whole)', 180.00),
  ('0af13835-fa0b-47e5-8ee7-8c87de9313d4', 'Rice (cup)', 15.00),
  ('6d28a284-ec7a-4da6-89f0-592dc04088e7', 'Kutsinta (piece)', 10.00),
  ('6d28a284-ec7a-4da6-89f0-592dc04088e7', 'Puto (pack of 6)', null),
  ('5ae1c60e-ddbb-4e03-a782-0b72023dc381', 'Pork BBQ (stick)', 20.00),
  ('0649beb4-36ed-4942-96ce-6b1107a51e2c', 'Hand-woven table runner', 450.00),
  ('0649beb4-36ed-4942-96ce-6b1107a51e2c', 'Weaving demo (per person)', null),
  ('8925a576-e13a-4cc8-84d9-98f2477a5b39', 'City keychain', 60.00),
  ('97548250-1019-48d5-9ae3-db9eef0555e1', 'Document printing (per page)', 5.00),
  ('1a470f8e-da17-445b-9a06-05fef0dddca3', 'Basic alteration', null);

-- -----------------------------------------------------------------------------
-- 8. Business photos — mirrors place_photos, at least one business with
--    none so the "no photos" queue signal has a real row to catch.
-- -----------------------------------------------------------------------------
insert into public.business_photos (business_id, photo_url, sort_order) values
  ('0af13835-fa0b-47e5-8ee7-8c87de9313d4', 'https://picsum.photos/seed/demo-riverside-eatery1/800/600', 0),
  ('0af13835-fa0b-47e5-8ee7-8c87de9313d4', 'https://picsum.photos/seed/demo-riverside-eatery2/800/600', 1),
  ('6d28a284-ec7a-4da6-89f0-592dc04088e7', 'https://picsum.photos/seed/demo-kakanin-corner/800/600', 0),
  ('5ae1c60e-ddbb-4e03-a782-0b72023dc381', 'https://picsum.photos/seed/demo-grill-house/800/600', 0),
  ('0649beb4-36ed-4942-96ce-6b1107a51e2c', 'https://picsum.photos/seed/demo-weaving-supplies1/800/600', 0),
  ('0649beb4-36ed-4942-96ce-6b1107a51e2c', 'https://picsum.photos/seed/demo-weaving-supplies2/800/600', 1),
  ('8925a576-e13a-4cc8-84d9-98f2477a5b39', 'https://picsum.photos/seed/demo-souvenir-hub/800/600', 0);
  -- Demo Print Services, Demo Tailoring Services, and Demo Repair Shop
  -- intentionally have zero photos — new, low-effort submissions is exactly
  -- the queue-priority case business-queue-priority.ts needs to sort high.

-- -----------------------------------------------------------------------------
-- 9. Business reviews — audit log, mirrors place_reviews, includes a
--    'feature' action per admin-panel-spec.md's Featured status toggle.
-- -----------------------------------------------------------------------------
insert into public.business_reviews (business_id, staff_id, action, notes, created_at) values
  ('0af13835-fa0b-47e5-8ee7-8c87de9313d4', 'fed52550-3ee1-48da-b033-211f6245fbb6', 'verify', null, now() - interval '30 days'),
  ('0af13835-fa0b-47e5-8ee7-8c87de9313d4', 'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'feature', 'Consistently included in food crawl planning, strong fit for the official crawl.', now() - interval '18 days'),
  ('6d28a284-ec7a-4da6-89f0-592dc04088e7', 'fed52550-3ee1-48da-b033-211f6245fbb6', 'verify', null, now() - interval '40 days'),
  ('0649beb4-36ed-4942-96ce-6b1107a51e2c', 'fed52550-3ee1-48da-b033-211f6245fbb6', 'verify', null, now() - interval '14 days'),
  ('0649beb4-36ed-4942-96ce-6b1107a51e2c', 'ab395d2b-a446-4892-b43f-2170af876c8a', 'feature', 'Ties directly into the Demo Weaving Center trail stop, good storytelling fit.', now() - interval '10 days'),
  ('8925a576-e13a-4cc8-84d9-98f2477a5b39', 'fed52550-3ee1-48da-b033-211f6245fbb6', 'reject', 'Listing photos appear to be stock images, not the actual storefront. Please resubmit with real photos before this can be verified.', now() - interval '5 days');

-- -----------------------------------------------------------------------------
-- 10. Business flags — covers both defenses from vendor-mode-spec.md: a
--     system-generated flag (flagged_by null) for the second-listing case,
--     and a user-submitted report (flagged_by set) for the crowdsourced
--     report action. One resolved, one still open.
-- -----------------------------------------------------------------------------
insert into public.business_flags (business_id, flag_reason, flagged_by, created_at, resolved) values
  ('13c73f2b-6101-4e89-a6ba-2639c048fcf8', 'Second listing attempt from an account that already has an active listing (Demo Tailoring Services).', null, now() - interval '1 days', false),
  ('8925a576-e13a-4cc8-84d9-98f2477a5b39', 'Photos look copied from a stock photo site, not the actual store.', 'ed8d4b57-6a77-418b-9db3-11c18e18fbca', now() - interval '6 days', true);

commit;

begin;

-- -----------------------------------------------------------------------------
-- 11. Routes (Trails) (3) — one per theme in migration 0005's check
--     constraint (heritage walk, food crawl, cultural tour), one draft to
--     exercise the build-then-publish flow from admin-panel-spec.md.
-- -----------------------------------------------------------------------------
insert into public.routes (
  id, name, theme, estimated_duration, estimated_budget, recommended_time,
  run_type, status, created_by, updated_at
) values
  ('c594515a-227e-4483-a2ea-88beb8d344e8', 'Demo Heritage Walk: Old Pasig', 'heritage walk',
   '2 hours', 'PHP 100 - 200', 'Morning, before 10:00 AM', 'self guided',
   'published', '6456adca-58a3-48c3-b0e6-6a086d03734f', now() - interval '20 days'),

  ('6885343e-bd45-4f0e-b0ca-4491564ee096', 'Demo Pasig Food Crawl', 'food crawl',
   '3 hours', 'PHP 300 - 500', 'Late afternoon into evening', 'self guided',
   'published', '6456adca-58a3-48c3-b0e6-6a086d03734f', now() - interval '9 days'),

  ('f69c54a2-e278-425e-abc5-c004bc0ef587', 'Demo Cultural Tour: Craft and Community', 'cultural tour',
   '2.5 hours', 'PHP 150 - 300', 'Weekday afternoons, workshop hours', 'CATO guided',
   'draft', 'e283c6fb-4dcd-455f-a60c-e35add77a330', now() - interval '2 days');
   -- Draft trail, still exercises the build-then-publish flow: staff with
   -- build_trails can see and edit it, routes_select_public correctly hides
   -- it from Guests and Registered Users until published.

-- -----------------------------------------------------------------------------
-- 12. Route stops — sequenced places/businesses per route, type-plus-id
--     pattern per migration 0005, no foreign key enforces stop_id, values
--     below point at real rows in places/businesses seeded above.
-- -----------------------------------------------------------------------------
insert into public.route_stops (route_id, stop_type, stop_id, sequence_order) values
  -- Demo Heritage Walk: Old Pasig
  ('c594515a-227e-4483-a2ea-88beb8d344e8', 'place', '6bce5398-b23e-4611-87e8-3747ea370bc4', 1), -- Demo Heritage House
  ('c594515a-227e-4483-a2ea-88beb8d344e8', 'place', '84125a2b-7501-4251-8b5d-c0d6c5edaa5c', 2), -- Demo Parish Church
  ('c594515a-227e-4483-a2ea-88beb8d344e8', 'place', '290fe466-9327-4660-9766-a2c64cdf078d', 3), -- Demo City Museum
  ('c594515a-227e-4483-a2ea-88beb8d344e8', 'place', '3610bb1f-bbbe-48db-a77a-17c2632eabb0', 4), -- Demo War Memorial

  -- Demo Pasig Food Crawl
  ('6885343e-bd45-4f0e-b0ca-4491564ee096', 'business', '0af13835-fa0b-47e5-8ee7-8c87de9313d4', 1), -- Demo Riverside Eatery
  ('6885343e-bd45-4f0e-b0ca-4491564ee096', 'business', '6d28a284-ec7a-4da6-89f0-592dc04088e7', 2), -- Demo Kakanin Corner
  ('6885343e-bd45-4f0e-b0ca-4491564ee096', 'place', 'f1b5f1df-d6a2-44b3-8997-8aa4920ae693', 3), -- Demo Riverside Walk (rest stop)

  -- Demo Cultural Tour: Craft and Community (draft)
  ('f69c54a2-e278-425e-abc5-c004bc0ef587', 'place', 'f552df7f-30a7-42ab-b470-06968810f437', 1), -- Demo Weaving Center
  ('f69c54a2-e278-425e-abc5-c004bc0ef587', 'business', '0649beb4-36ed-4942-96ce-6b1107a51e2c', 2), -- Demo Weaving Supplies
  ('f69c54a2-e278-425e-abc5-c004bc0ef587', 'place', '56302e94-c04a-4e3e-8a2c-068d92e19298', 3); -- Demo Artisan Plaza

-- -----------------------------------------------------------------------------
-- 13. Discovery content — proximity-triggered secrets only, per
--     data-model.md's rule that general background stays on the Place or
--     Business page. Sequenced so each stop references the last per
--     build-priorities.md's "sequenced stories, not trivia pop ups."
--     related_route_stop_id links back to the matching row in section 12.
-- -----------------------------------------------------------------------------
insert into public.discovery_content (
  route_id, title, content, related_location_type, related_location_id,
  related_route_stop_id, sequence_order, unlock_radius, needs_place_review, status
) values
  ('c594515a-227e-4483-a2ea-88beb8d344e8',
   'The Family That Stayed',
   'Before you go in, look at the side gate facing the alley. During the occupation, this was the door the family actually used, the front door stayed locked for years. What you are about to walk through was never meant to be a museum piece, it was someone hiding in plain sight.',
   'place', '6bce5398-b23e-4611-87e8-3747ea370bc4',
   (select id from public.route_stops where route_id = 'c594515a-227e-4483-a2ea-88beb8d344e8' and sequence_order = 1),
   1, 50, false, 'active'),

  ('c594515a-227e-4483-a2ea-88beb8d344e8',
   'A Bell Recast Twice',
   'The house you just left kept its secrets quiet. This church did the opposite, its bell has been recast twice, and both times the town paid for it out of pocket rather than let the parish go without one. Listen for it before you leave the plaza.',
   'place', '84125a2b-7501-4251-8b5d-c0d6c5edaa5c',
   (select id from public.route_stops where route_id = 'c594515a-227e-4483-a2ea-88beb8d344e8' and sequence_order = 2),
   2, 40, false, 'active'),

  ('c594515a-227e-4483-a2ea-88beb8d344e8',
   'What the Excavation Found',
   'Some of what you will see inside was not donated, it was dug up. A stretch of pipework nearby turned up trade pottery nobody expected, and it ended up here instead of a warehouse. Ask the desk which case holds it, it is not labeled the way you would expect.',
   'place', '290fe466-9327-4660-9766-a2c64cdf078d',
   (select id from public.route_stops where route_id = 'c594515a-227e-4483-a2ea-88beb8d344e8' and sequence_order = 3),
   3, 40, false, 'active'),

  -- New historical claim not yet tied to a verified Place on its own page,
  -- exercises admin-panel-spec.md's Trail Publishing exception: this row
  -- must route through the Places review queue before the trail goes live,
  -- flagged here even though the parent route is already published, so the
  -- app layer has a real row to test that check against.
  ('6885343e-bd45-4f0e-b0ca-4491564ee096',
   'The Recipe Nobody Wrote Down',
   'Ask before you order. The sinigang here follows a souring method that was never written into any of the published Pasig cookbooks CATO has on file, it was verbally passed down and nearly lost when the original cook stopped working the stall.',
   'business', '0af13835-fa0b-47e5-8ee7-8c87de9313d4',
   (select id from public.route_stops where route_id = '6885343e-bd45-4f0e-b0ca-4491564ee096' and sequence_order = 1),
   1, 30, true, 'active');

-- -----------------------------------------------------------------------------
-- 14. Trail credentials — one per published route, per data-model.md and
--     build-priorities.md's "credential for completing a specific route,"
--     not a generic points system.
-- -----------------------------------------------------------------------------
insert into public.trail_credentials (id, credential_name, linked_route_id, requirement_to_earn) values
  ('4bb0668a-20d1-4e22-88eb-2f8e608c9b2b', 'Old Pasig Walker', 'c594515a-227e-4483-a2ea-88beb8d344e8', 'Visit all 4 stops in sequence and finish at Demo War Memorial'),
  ('e47e6cbf-6f6a-47fc-917e-0d3fca9480ce', 'Pasig Food Crawl Finisher', '6885343e-bd45-4f0e-b0ca-4491564ee096', 'Visit all 3 stops in sequence within the same day');
  -- No credential yet for the draft Cultural Tour route, matches its
  -- unpublished status, a credential tied to an unpublished trail would be
  -- premature.

-- -----------------------------------------------------------------------------
-- 15. Personal records — completed_routes, user_credentials, saved_places,
--     saved_routes. Owned by residents and vendors from section 1/2, never
--     staff, these are End User records per data-model.md. Deliberately
--     varied per person so cohort-stat messaging like "one of 200 people who
--     finished this route this month" (competitive-positioning.md) has real
--     counts to sum instead of a single row.
-- -----------------------------------------------------------------------------
insert into public.completed_routes (user_id, route_id, completed_at) values
  ('ed8d4b57-6a77-418b-9db3-11c18e18fbca', 'c594515a-227e-4483-a2ea-88beb8d344e8', now() - interval '18 days'),
  ('75486d5a-d222-4853-8046-8a55199c6208', 'c594515a-227e-4483-a2ea-88beb8d344e8', now() - interval '10 days'),
  ('e927ff41-bff8-43f0-9c1f-98fcaa54793d', 'c594515a-227e-4483-a2ea-88beb8d344e8', now() - interval '4 days'),
  ('db860542-f964-4290-a8f4-72c58c0dfff3', '6885343e-bd45-4f0e-b0ca-4491564ee096', now() - interval '7 days'),
  ('c5a73b63-20bd-4310-9515-3f22fa9dd40c', '6885343e-bd45-4f0e-b0ca-4491564ee096', now() - interval '2 days'),
  ('a77bf9f3-1107-4e9e-9677-ebbcaa662cba', '6885343e-bd45-4f0e-b0ca-4491564ee096', now() - interval '1 days');

insert into public.user_credentials (user_id, credential_id, earned_at) values
  ('ed8d4b57-6a77-418b-9db3-11c18e18fbca', '4bb0668a-20d1-4e22-88eb-2f8e608c9b2b', now() - interval '18 days'),
  ('75486d5a-d222-4853-8046-8a55199c6208', '4bb0668a-20d1-4e22-88eb-2f8e608c9b2b', now() - interval '10 days'),
  ('e927ff41-bff8-43f0-9c1f-98fcaa54793d', '4bb0668a-20d1-4e22-88eb-2f8e608c9b2b', now() - interval '4 days'),
  ('db860542-f964-4290-a8f4-72c58c0dfff3', 'e47e6cbf-6f6a-47fc-917e-0d3fca9480ce', now() - interval '7 days'),
  ('c5a73b63-20bd-4310-9515-3f22fa9dd40c', 'e47e6cbf-6f6a-47fc-917e-0d3fca9480ce', now() - interval '2 days'),
  ('a77bf9f3-1107-4e9e-9677-ebbcaa662cba', 'e47e6cbf-6f6a-47fc-917e-0d3fca9480ce', now() - interval '1 days');

insert into public.saved_places (user_id, place_id, saved_at) values
  ('ed8d4b57-6a77-418b-9db3-11c18e18fbca', '6bce5398-b23e-4611-87e8-3747ea370bc4', now() - interval '19 days'),
  ('ed8d4b57-6a77-418b-9db3-11c18e18fbca', '290fe466-9327-4660-9766-a2c64cdf078d', now() - interval '9 days'),
  ('75486d5a-d222-4853-8046-8a55199c6208', '84125a2b-7501-4251-8b5d-c0d6c5edaa5c', now() - interval '11 days'),
  ('e927ff41-bff8-43f0-9c1f-98fcaa54793d', '56302e94-c04a-4e3e-8a2c-068d92e19298', now() - interval '3 days'),
  ('db860542-f964-4290-a8f4-72c58c0dfff3', 'f1b5f1df-d6a2-44b3-8997-8aa4920ae693', now() - interval '8 days'),
  ('62acb632-8642-4b55-86ac-dfdee7f1d953', '3610bb1f-bbbe-48db-a77a-17c2632eabb0', now() - interval '1 days');

insert into public.saved_routes (user_id, route_id, saved_at) values
  ('ed8d4b57-6a77-418b-9db3-11c18e18fbca', 'c594515a-227e-4483-a2ea-88beb8d344e8', now() - interval '19 days'),
  ('75486d5a-d222-4853-8046-8a55199c6208', 'c594515a-227e-4483-a2ea-88beb8d344e8', now() - interval '11 days'),
  ('c5a73b63-20bd-4310-9515-3f22fa9dd40c', '6885343e-bd45-4f0e-b0ca-4491564ee096', now() - interval '5 days'),
  ('e927ff41-bff8-43f0-9c1f-98fcaa54793d', 'f69c54a2-e278-425e-abc5-c004bc0ef587', now() - interval '2 days');
  -- Last row: a resident saved the still-draft Cultural Tour route. This is
  -- only reachable in practice via a staff preview link today, kept here so
  -- saved_routes has a row pointing at an unpublished route once that path
  -- exists, rather than only ever being tested against published routes.

commit;

begin;

-- -----------------------------------------------------------------------------
-- 16. Events & Announcements (6) — spans every category in migration 0006's
--     check constraint, published/draft, and upcoming/ongoing/past. The
--     Pasig Creative Arts Academy and Youth Development Center references
--     mirror real CATO programs named in docs/feature-scope-changes.md,
--     reworded as demo content, not copied from any real announcement text.
-- -----------------------------------------------------------------------------
insert into public.events (
  id, title, description, category, related_program, date_time, location,
  related_place_id, enrollment_info, posted_by, lifecycle_status, published,
  language, updated_at
) values
  ('f2676343-4da4-4ecf-b685-4c6f744ad5a3', 'Demo Creative Arts Academy: New Batch Enrollment',
   'Free short courses for young Pasigueños covering visual arts, music, and crafts, run out of the Demo Youth Development Center.',
   'program enrollment', 'Demo Creative Arts Academy',
   now() + interval '14 days', 'Demo Youth Development Center, Barangay Demo',
   null, '40 slots available, walk-in registration on enrollment day, ID and birth certificate required.',
   'e283c6fb-4dcd-455f-a60c-e35add77a330', 'upcoming', true, 'Both', now() - interval '3 days'),

  ('f7928bc3-b106-4729-a232-eafb9103c67c', 'Demo Guided Photo Walk: Old Pasig',
   'A CATO-led photo walk following the Demo Heritage Walk route, camera phones welcome, no professional gear required.',
   'heritage walk', null, now() + interval '5 days', 'Meet at Demo Heritage House',
   '6bce5398-b23e-4611-87e8-3747ea370bc4', 'Free, limited to 25 participants, register via the CATO office.',
   'e283c6fb-4dcd-455f-a60c-e35add77a330', 'upcoming', true, 'English', now() - interval '2 days'),

  ('a53a2b79-b988-40d8-8f11-a26e59ea13f5', 'Demo Riverside Festival',
   'Annual community festival along the riverside promenade with local food stalls, craft vendors, and evening performances.',
   'festival', null, now(), 'Demo Riverside Walk',
   'f1b5f1df-d6a2-44b3-8997-8aa4920ae693', null,
   'e283c6fb-4dcd-455f-a60c-e35add77a330', 'ongoing', true, 'Both', now()),

  ('0d742e7d-2477-486d-8cff-d753c4b71ec6', 'Demo Office Hours Update',
   'The Tourism Office front desk will observe adjusted hours during the upcoming holiday period.',
   'general announcement', null, now() - interval '2 days', 'Demo CATO Office',
   null, null, 'e283c6fb-4dcd-455f-a60c-e35add77a330', 'past', true, 'English', now() - interval '2 days'),

  ('884dc1c7-0286-43f4-bef1-28ee6fd5bafb', 'Demo Weaving Workshop Series (Draft)',
   'Planned weekend workshop series at the Demo Weaving Center, details still being finalized with the cooperative.',
   'workshop', null, now() + interval '30 days', 'Demo Weaving Center',
   'f552df7f-30a7-42ab-b470-06968810f437', null,
   'e283c6fb-4dcd-455f-a60c-e35add77a330', 'upcoming', false, 'Filipino', now() - interval '1 days'),
   -- Draft, published = false: exercises the create/edit/publish distinction
   -- from admin-panel-spec.md, should not appear on the public Home tab.

  ('433471cd-43ed-4ca2-a6d6-5e9c2becca0d', 'Demo Heritage Month Kickoff (2025)',
   'Past event marking the start of last year''s heritage month programming across CATO-managed sites.',
   'festival', null, now() - interval '200 days', 'Demo Plaza Center',
   '56302e94-c04a-4e3e-8a2c-068d92e19298', null,
   'f25e552f-e90c-4fc4-884e-02f46c40a47f', 'past', true, 'Both', now() - interval '200 days');

commit;
