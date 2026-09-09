-- Phase 5.3 (step-4-phases.md, step-4-plan.md's review exception),
-- resolved in project-foundation/phase-5-decisions.md Decision 2.
--
-- discovery_content_select_staff and discovery_content_write_staff
-- (migration 0005) only grant access to build_trails or admin. Phase 5.3
-- surfaces flagged discovery_content rows (needs_place_review = true, see
-- migration 0012) as extra rows in the existing Places queue
-- (admin-places.tsx), reusing its verify/reject actions rather than
-- building a second queue, per step-4-plan.md's review exception: "reuse
-- the same table and verify/reject actions." admin-places.tsx and its
-- route (/admin/places in App.tsx) are gated on manage_places, not
-- build_trails, so a manage_places-only staffer working that queue could
-- neither see nor act on a flagged row under the policies as they stood:
-- select would silently return nothing, and any update attempt would be
-- blocked by RLS even though the UI let them click Verify/Reject.
--
-- Fix: add a manage_places branch to both policies, same shape as the
-- existing build_trails branch. Both permissions now grant access; a
-- staffer only needs one of the two, matching admin-panel-spec.md's
-- reasoning for why a queue is scoped to whichever permission actually
-- reviews it. Left on the inline `exists (select 1 from public.profiles
-- p ...)` pattern rather than is_admin()/has_permission() (0009-0011):
-- migration 0011 documented that routes/route_stops/discovery_content
-- were deliberately left out of that cleanup since they don't complete a
-- recursion cycle back into profiles, this migration doesn't change that.
drop policy "discovery_content_select_staff" on public.discovery_content;
create policy "discovery_content_select_staff"
  on public.discovery_content for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (
          p.staff_role = 'admin'
          or 'build_trails' = any(p.system_permission)
          or 'manage_places' = any(p.system_permission)
        )
    )
  );

drop policy "discovery_content_write_staff" on public.discovery_content;
create policy "discovery_content_write_staff"
  on public.discovery_content for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (
          p.staff_role = 'admin'
          or 'build_trails' = any(p.system_permission)
          or 'manage_places' = any(p.system_permission)
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (
          p.staff_role = 'admin'
          or 'build_trails' = any(p.system_permission)
          or 'manage_places' = any(p.system_permission)
        )
    )
  );
