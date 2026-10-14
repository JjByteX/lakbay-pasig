-- =============================================================================
-- Lakbay Pasig — Demo accounts (seed 1 of 2)
-- =============================================================================
-- Local development and demo only. Auto-applied by `supabase db reset` /
-- `supabase start` on the LOCAL Docker stack, in the order set in
-- supabase/config.toml ([db.seed] sql_paths): this file first, then
-- 02_content.sql. Never runs against the hosted project: CI's deploy-migrations
-- job only runs `supabase db push` (migrations), never `db reset`.
--
-- Everyone in here is a demo account. No real names, no real contact info, no
-- real vendor identities. Every login uses the same throwaway password so the
-- whole team can sign in as anyone during development. Passwords are Supabase
-- Auth's own bcrypt hash of the string below, so nothing here is a fresh
-- secret to rotate:
--
--   Password for every seeded account:  Demo!Password123
--
-- Covers all four roles from project-foundation/project-brief.md:
--   - CATO Staff (Admin + Staff, mixed permission sets, one inactive, one with
--     zero permissions to exercise admin.tsx's "no sections assigned" state)
--   - Registered User (residents, no business)
--   - Vendor (a resident who submitted a business — vendor-mode-spec.md:
--     "Vendor is not a separate account type. It is a mode switch on a
--     Registered User account")
--   - Guest requires no seed row, it is the no-session state.
--
-- Account ages and permission mixes span every state so every admin list,
-- filter and badge, and src/lib/business-queue-priority.ts signal, has
-- something to render against.
--
-- This file must never ship to a real site. 02_content.sql points its
-- reviewed_by, submitted_by, staff_id and created_by columns at the staff and
-- vendor accounts created here, so a production content load needs those
-- columns set to null or to a real admin first.
--
-- Re-running: section 0 below deletes the @lakbay-demo.local accounts, which
-- cascades into everything that references them, so run this file and then
-- 02_content.sql again (or use `supabase db reset`). Running 02_content.sql
-- alone twice would hit duplicate keys.
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
  -- reports-phases.md Phase 6.3: demo account holding only view_reports, so
  -- the Phase 6 gate (sees Reports, nothing else, redirected from a section
  -- it lacks) has a real login to exercise, same reasoning as staff.landing.
  ('00000000-0000-0000-0000-000000000000', 'e080ddf9-804f-4beb-b6cd-04b52f954e54', 'authenticated', 'authenticated', 'staff.reports@lakbay-demo.local', extensions.crypt('Demo!Password123', extensions.gen_salt('bf')), now(), now() - interval '20 days', now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''),

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

-- reports-phases.md Phase 6.3: holds only view_reports, nothing else.
-- Reports must be the only admin section this login sees.
update public.profiles set
  role = 'staff', staff_role = 'staff', active_status = 'active',
  display_name = 'Demo Staff Reports', contact_number = '+639170000008',
  position = 'Planning Analyst',
  system_permission = array['view_reports']
where id = 'e080ddf9-804f-4beb-b6cd-04b52f954e54';

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
