-- Client decision: remove the Language feature entirely, across every
-- table that carried it. Not a UI translation/i18n system -- there was
-- none in this codebase -- just a stored "English / Filipino / Both"
-- metadata field on places, businesses, and events, plus a matching
-- "preferred_language" on the visitor's own profile (data-model.md's End
-- User Preferred Language). Neither drove any filtering, personalization,
-- or translation logic anywhere in src/ (grepped, confirmed before this
-- migration was written): removing the columns changes no other query.
--
-- Same drop-only shape as 0022/0023/0024/0026's own `drop column`
-- migrations -- no replacement column, no backfill needed, since nothing
-- downstream reads these values into a new shape. App code (business-
-- fields.tsx, admin-place-detail.tsx, admin-business-detail.tsx,
-- admin-event-detail.tsx, profile.tsx, vendor-dashboard.tsx,
-- vendor-types.ts, vendor-business.ts, auth-context.tsx, auth-types.ts)
-- and supabase/seed.sql were updated ahead of this migration to stop
-- reading/writing these columns.

alter table public.places
  drop column language;

alter table public.businesses
  drop column language;

alter table public.events
  drop column language;

alter table public.profiles
  drop column preferred_language;
