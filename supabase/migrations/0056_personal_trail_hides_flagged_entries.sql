-- 0056: a flagged discovery entry stays hidden on the personal trail path.
-- Human-approved, see docs/user-trails-plan.md and decision-log.md #48.
--
-- 0054 lets a place entry show through a personal trail the caller owns. A
-- published trail is held back by the publish gate while an entry on its stops
-- is flagged (needs_place_review, 0012 and 0053). A personal trail has no such
-- gate, so a user could add a pending business and read history no reviewer has
-- checked. On this path the flag is the gate: a flagged entry does not show.
--
-- Written as a new migration, not an edit of 0054 and 0055, so it also applies
-- where those two already ran. Safe to run twice.
--
-- Only the personal branch changes. The published branch is as in 0054, so a
-- flagged entry already live on a published trail stays visible (#47).

drop policy if exists "discovery_content_select_public" on public.discovery_content;

create policy "discovery_content_select_public"
  on public.discovery_content for select
  using (
    status = 'active'
    and (
      exists (
        select 1 from public.routes r
        where r.id = route_id and r.status = 'published'
      )
      or (
        route_id is null
        and exists (
          select 1
          from public.route_stops rs
          join public.routes r on r.id = rs.route_id
          where (
              r.status = 'published'
              or (r.personal and r.created_by = auth.uid() and not discovery_content.needs_place_review)
            )
            and rs.stop_type = related_location_type
            and rs.stop_id = related_location_id
        )
      )
    )
  );

-- "Has a secret" (0055) skips a flagged entry too, since a personal trail
-- cannot read it. Same body as 0055 plus one condition.
create or replace function public.locations_with_entries()
returns table (location_type text, location_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct dc.related_location_type, dc.related_location_id
  from public.discovery_content dc
  where dc.route_id is null
    and dc.status = 'active'
    and not dc.needs_place_review
    and (
      (dc.related_location_type = 'place' and exists (
        select 1 from public.places p
        where p.id = dc.related_location_id and p.verification_status = 'verified'
      ))
      or
      (dc.related_location_type = 'business' and exists (
        select 1 from public.businesses b
        where b.id = dc.related_location_id and b.verification_status in ('verified', 'pending')
      ))
    );
$$;

revoke execute on function public.locations_with_entries() from public, anon;
grant execute on function public.locations_with_entries() to authenticated;
