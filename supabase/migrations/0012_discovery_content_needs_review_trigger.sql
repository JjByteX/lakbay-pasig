-- Phase 5.2 (step-4-phases.md, step-4-plan.md's review exception),
-- resolved in project-foundation/phase-5-decisions.md Decision 1.
--
-- needs_place_review must be computed "server side at save time," not left
-- to the client and not offered as a staff checkbox, per constraints.md's
-- Automation First rule ("if yes, and it is logical and safe, automate
-- it") and both docs' own wording. A trigger is the only way this is
-- actually enforced server side: a value merely computed in the React
-- form before insert is still a client-supplied value RLS cannot tell
-- apart from a staff judgment call, and phase-5-decisions.md's Decision 1
-- lays out why a trigger is called for here rather than a client-side
-- computation, including the direct precedent already in this codebase
-- (migration 0001's handle_new_user() trigger on auth.users).
--
-- Rule, unchanged from step-4-plan.md's review exception:
--   needs_place_review = related_location_type = 'business'
--                      OR (related_location_type = 'place'
--                          AND that place's verification_status != 'verified')
--
-- Fires before insert and before update, so an edit that changes which
-- location a discovery_content row is tied to (or a re-save with no
-- change) always reflects the current rule, not a value that could go
-- stale from a client that skipped recomputing it. It does not fire on
-- the referenced place's own verification_status changing later, since
-- neither doc asks for that, only for the value to be correct "at save
-- time" for discovery_content itself.
create function public.compute_discovery_content_needs_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.related_location_type = 'business' then
    new.needs_place_review := true;
  else
    -- related_location_type = 'place', enforced by discovery_content's own
    -- check constraint, no other value can reach this branch.
    new.needs_place_review := not exists (
      select 1 from public.places
      where id = new.related_location_id
        and verification_status = 'verified'
    );
  end if;
  return new;
end;
$$;

create trigger discovery_content_set_needs_review
  before insert or update on public.discovery_content
  for each row execute function public.compute_discovery_content_needs_review();
