-- Phase 3.1: Businesses table.
-- Fields from data-model.md plus vendor-mode-spec.md changes. No price_range
-- column, replaced by business_items since a business can span price points.
-- "Trails Included In" left out as a column for the same reason as places,
-- it is derivable from route_stops once that table exists in phase 4.
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text not null check (business_type in ('Product', 'Service', 'Both')),
  category text,
  description text,
  address text not null,
  latitude double precision,
  longitude double precision,
  contact text,
  opening_hours text,
  business_story text,
  unique_specialty text,
  accessibility_info text,
  social_media_links text[],
  language text check (language in ('English', 'Filipino', 'Both')),
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'unverified')),
  reviewed_by uuid references public.profiles(id),
  review_notes text,
  featured_status text not null default 'listed' check (featured_status in ('listed', 'featured')),
  submitted_by uuid not null references public.profiles(id),
  registered_or_informal text check (registered_or_informal in ('registered', 'informal')),
  views_count int not null default 0,
  saves_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- Phase 3.2: Business items. Price stays nullable, no not-null constraint,
-- so publishing a listing or an item never requires a price. A missing
-- price is a filter-time concern, handled in the query, not an insert block.
create table public.business_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  price numeric
);

-- Phase 3.3: Review audit log. Same shape as place_reviews, plus 'feature'
-- as an action, since Featured status is also a staff decision worth
-- logging per admin-panel-spec.md.
create table public.business_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null references public.profiles(id),
  action text not null check (action in ('verify', 'reject', 'feature')),
  notes text,
  created_at timestamptz not null default now()
);

-- Phase 3.4: Business flags. Covers both the second-listing-attempt flag
-- and the crowdsourced report action from vendor-mode-spec.md.
-- flagged_by is nullable since a system-generated flag (second listing
-- attempt) has no reporting user, only a user-submitted report does.
create table public.business_flags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  flag_reason text not null,
  flagged_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);

-- Phase 3.5: RLS on businesses.
-- Public read where verified, or where the row belongs to the requesting
-- user, so a pending listing stays visible to its own submitter.
-- Insert open to any authenticated user, matching instant-live self-listing.
-- Two update policies exist for the same reason profiles_update_own and
-- profiles_update_admin are split in migration 0001: a using/with check
-- guards the row, not individual columns. The app layer must never send
-- verification_status, featured_status, review_notes, or reviewed_by in a
-- vendor's own self-update request, and must never rely on this policy
-- alone to block that.
alter table public.businesses enable row level security;

create policy "businesses_select_public"
  on public.businesses for select
  using (verification_status = 'verified');

create policy "businesses_select_own"
  on public.businesses for select
  using (auth.uid() = submitted_by);

create policy "businesses_select_staff"
  on public.businesses for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );

create policy "businesses_insert_own"
  on public.businesses for insert
  with check (auth.uid() = submitted_by);

create policy "businesses_update_own"
  on public.businesses for update
  using (auth.uid() = submitted_by)
  with check (auth.uid() = submitted_by);

create policy "businesses_update_staff"
  on public.businesses for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );

-- Phase 3.6: RLS on business_items.
-- Read follows the parent business's read rule. Write restricted to the
-- owning vendor or staff with review access.
alter table public.business_items enable row level security;

create policy "business_items_select_public"
  on public.business_items for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.verification_status = 'verified'
    )
  );

create policy "business_items_select_own"
  on public.business_items for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.submitted_by = auth.uid()
    )
  );

create policy "business_items_write_own"
  on public.business_items for all
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.submitted_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.submitted_by = auth.uid()
    )
  );

create policy "business_items_write_staff"
  on public.business_items for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );

-- Phase 3.7: RLS on business_reviews, staff read and insert only.
alter table public.business_reviews enable row level security;

create policy "business_reviews_select_staff"
  on public.business_reviews for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );

create policy "business_reviews_insert_staff"
  on public.business_reviews for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );

-- Phase 3.7: RLS on business_flags.
-- Insert open to any authenticated user, this is the crowdsourced report
-- action from vendor-mode-spec.md. Read and resolve restricted to staff.
alter table public.business_flags enable row level security;

create policy "business_flags_insert_any"
  on public.business_flags for insert
  with check (auth.uid() is not null);

create policy "business_flags_select_staff"
  on public.business_flags for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );

create policy "business_flags_update_staff"
  on public.business_flags for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'review_businesses' = any(p.system_permission))
    )
  );
