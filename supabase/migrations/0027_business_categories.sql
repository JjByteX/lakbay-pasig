-- Category Directory Expansion, Phase 0.3/0.4. Human-confirmed per
-- constraints.md's No Silent Overrides rule and architecture-notes.md's
-- never-touch-without-approval list (schema). Logged in decision-log.md.
--
-- Gap: businesses.category was plain nullable text, no check constraint,
-- ever since migration 0004. A single free-text Input in business-
-- fields.tsx, shared by the admin business form and the vendor
-- self-listing form. No fixed list, no icon, no consistency between
-- entries. This table gives Business the same admin-managed list Places,
-- Trails, and Announcements already have, for the first time rather than
-- converting an existing fixed list.

-- 0.3: the category directory. Same shape as place_categories/
-- trail_categories/event_categories (migrations 0022-0024).
create table public.business_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 0.3: RLS. Public read on active rows, no sign-in required, same
-- no-`to`-clause shape place_categories_select_public (0022) already uses,
-- since the business form's category picker (both admin and vendor) needs
-- this list without assuming a staff session. Write limited to
-- review_businesses or admin, matching who already owns Businesses itself
-- (0004's businesses_update_staff/business_reviews_insert_staff), since a
-- business category is Business content, not a new content type needing
-- its own permission. Not manage_places: that permission belongs to
-- Places, a different content type with its own reviewer.
alter table public.business_categories enable row level security;

create policy "business_categories_select_public"
  on public.business_categories for select
  using (active = true);

create policy "business_categories_select_staff"
  on public.business_categories for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );

create policy "business_categories_write_staff"
  on public.business_categories for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );

-- 0.3: no seed rows. Unlike the other three tables, businesses.category
-- was never a fixed list, so there is no confirmed set of names to carry
-- over. Table starts empty; Admin or Staff with review_businesses adds
-- real categories through the same admin form every other tab already
-- uses, per the expansion plan doc.

-- 0.4: new column, nullable, matching category's own prior optional
-- status. References business_categories, not a plain text copy, so a
-- category rename or icon change applies everywhere at once, same as
-- trail_categories.category_id and event_categories.category_id before it.
alter table public.businesses
  add column category_id uuid references public.business_categories(id);

-- 0.4: preserve the old free text rather than dropping it outright. No
-- automatic match is possible: business_categories starts empty (0.3), so
-- there is nothing for a business's existing free-text value to resolve
-- against. Every business's category_id starts null here, same meaning as
-- "no category set yet." Whoever previously typed a category (vendor or
-- staff) does not lose that entry: it survives read-only in
-- category_text_legacy, not read by any app code going forward, resolved
-- into a real category_id later through a manual admin pass, not by this
-- migration.
alter table public.businesses
  rename column category to category_text_legacy;
