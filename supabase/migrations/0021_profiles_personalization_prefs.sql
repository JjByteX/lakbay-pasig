-- Settings: Personalization, Phase 0. Human-confirmed schema change per
-- constraints.md's No Silent Overrides rule and architecture-notes.md's
-- never-touch-without-approval list. Logged in decision-log.md entry 7.
--
-- Gap: no theme or font size preference exists anywhere in the schema.
-- data-model.md's End User field list has neither, this is new scope,
-- not something silently added under an existing field. Storage is
-- synced to account per settings-personalization-plan.md's Storage
-- section, not local-only, so both live on profiles.
--
-- Both columns are nullable, same optional-per-row shape as 0017's
-- verified_at and 0020's end_date_time. Null means unset, not a stored
-- default: the app decides what an unset value means at read time
-- (Phase 1 of this feature), the database only enforces the allowed
-- value set when a value IS present.
alter table public.profiles
  add column theme_preference text
    check (theme_preference is null or theme_preference in ('light', 'dark')),
  add column font_size_preference text
    check (font_size_preference is null or font_size_preference in ('small', 'default', 'large'));

-- Same column-level trust boundary note as migration 0002's Phase 1.4:
-- profiles_update_own (0001) guards the row, not individual columns.
-- These two are self-service preferences (unlike role, staff_role,
-- position, system_permission), so a self-write to either is expected
-- and correct, not a boundary that needs closing.
