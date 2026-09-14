-- Human-confirmed schema change, per constraints.md's No Silent Overrides
-- rule. Bundles Phase 6.1-6.3 (profile picture) and Phase 8.2 (account
-- settings fields) into one migration since both touch profiles and were
-- confirmed together to avoid two migration rounds. See decision-log.md
-- entry #12.

-- Phase 6.1/6.2: Profile Picture. data-model.md lists Profile Picture for
-- both End User and CATO Staff, but no column exists on profiles today.
-- Nullable, optional for both roles per data-model.md, same shape as
-- verified_at (0017), end_date_time (0020), theme_preference (0021).
--
-- Phase 6.3: storage decision. Stores a Supabase Storage public URL
-- (text), not a raw storage path. Matches the existing photo-storage
-- pattern already coded in this repo: place_photos.photo_url (0003) and
-- admin-place-detail.tsx's upload flow both store the public URL string
-- and derive the storage-relative path back out of it only when needed
-- (deletion). A hosted-external-URL field was considered and rejected:
-- it would be a second, inconsistent photo-storage convention alongside
-- the one already established for place/business photos, against
-- constraints.md's Inventory Before Suggesting rule.
alter table public.profiles
  add column profile_picture text;

-- Phase 8.2: Username. Confirmed against data-model.md, every prior
-- migration (0001/0002), and auth-types.ts's Profile interface directly --
-- genuinely missing, not merely undocumented. Nullable: existing rows have
-- no value to backfill from, same "unset means unset, app decides at read
-- time" reasoning as 0021's theme_preference/font_size_preference. Unique
-- so two accounts can't collide once a value is set; partial index so
-- multiple nulls (not-yet-chosen usernames) don't violate uniqueness.
alter table public.profiles
  add column username text;

create unique index profiles_username_unique
  on public.profiles (username)
  where username is not null;

-- Phase 8.2: Contact Number. Already exists (contact_number, migration
-- 0002). No column change needed -- Settings' Contact Number field
-- (Phase 8.5) writes to this existing column.

-- Phase 8.2: First Name / Last Name. data-model.md never listed these as
-- separate fields, End User and Staff have only ever had one
-- display_name column (0002), used identically by both roles and by
-- every existing consumer (profile.tsx, staff-form-dialog.tsx,
-- admin-sidebar.tsx's initial, public-shell.tsx's AccountMenu). Splitting
-- into two columns is new scope beyond the documented model, confirmed
-- directly rather than assumed. display_name is kept, not dropped, so no
-- existing read breaks mid-migration -- Settings UI (Phase 8.3/8.4) owns
-- deciding how a name is composed from the two new fields, not this
-- migration.
alter table public.profiles
  add column first_name text,
  add column last_name text;

-- No RLS policy change needed for any of the four columns above:
-- profiles_update_own (0001) already guards the row, and all four are
-- self-service fields the signed-in user is expected to write to
-- themselves, not staff-only fields requiring a new column-level trust
-- boundary note (same reasoning 0021's entry in architecture-notes.md
-- already gives for theme_preference/font_size_preference).
