-- Category Colors, Phase 1. Human-approved per architecture-notes.md's
-- never-touch-without-approval list (schema). Logged in decision-log.md,
-- entry #27.
--
-- Gap: every map marker looks the same, a white circle with a blue or grey
-- ring, because categories only carry a name and an icon. Admins have no
-- way to give a category a color. This adds one to the two category lists
-- that show on the map, Places and Businesses. Trails, Announcements and
-- Facilities never appear as pins, so they get no column.
--
-- Nullable, no default, no check, no not null: null means unset and the app
-- decides what that reads as, per decision-log.md entry #7. The value is a
-- palette key such as 'red' or 'teal', from src/lib/category-colors.ts. The
-- palette lives in code, so a new color is a code change, not a migration,
-- same as the icon lists. Null reads as blue in the app. No backfill,
-- existing rows stay null until an admin recolors them.
--
-- No RLS change. The policies on place_categories (0022) and
-- business_categories (0027) are row based, so they already cover a new
-- column. No log_activity() change either. The 0037 activity log diffs
-- to_jsonb(old) against to_jsonb(new) generically, so a color edit is
-- logged as is (entry #19).
--
-- Assumes 0040 (business item photos) is applied first.

alter table public.place_categories
  add column color text;

alter table public.business_categories
  add column color text;
