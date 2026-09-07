-- Phase 1.1: End User fields, from data-model.md, no home elsewhere.
alter table public.profiles
  add column display_name text,
  add column contact_number text,
  add column date_of_birth date,
  add column preferred_language text,
  add column preferred_categories text[];

-- Phase 1.2: Staff fields, needed before any staff-gated table exists.
alter table public.profiles
  add column position text,
  add column system_permission text[];

-- Phase 1.3: system_permission is a fixed set, applies to staff_role = staff only.
-- staff_role = admin bypasses this array entirely in every policy, admin
-- already has full access per admin-panel-spec.md, so no admin row needs
-- values here.
alter table public.profiles
  add constraint system_permission_values check (
    system_permission is null or system_permission <@ array[
      'manage_places',
      'review_businesses',
      'publish_events',
      'build_trails'
    ]
  );

-- Phase 1.4: extend self-update protection to the new columns.
-- Same pattern as migration 0001: a using/with check only guards row access,
-- not columns, so the app layer must never send role, staff_role,
-- active_status, position, or system_permission in a self-update request.
-- No policy change needed here, profiles_update_own already covers the row,
-- this comment documents the column-level trust boundary for the new fields.
