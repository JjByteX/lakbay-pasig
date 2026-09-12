-- admin-form-fields-plan.md #4: entrance_fee (places) and estimated_budget
-- (routes) become numeric, matching business_items.price (0004), which
-- already uses this exact pattern. Both were free text and accepted
-- letters; the app layer now sends a plain peso amount via a
-- type="number" input, no currency symbol typed by the user.
--
-- estimated_budget was a free-text range (e.g. "₱300-500") before this
-- migration. A text value that isn't a plain number (any existing range,
-- or blank/non-numeric text) cannot be cast automatically -- USING
-- nullif(...) below sends anything that fails the numeric cast to null
-- rather than failing the migration, so a staff member re-enters it as a
-- single amount instead of a range. Same handling applied to entrance_fee
-- for consistency, even though it was less likely to hold a range.

alter table public.places
  alter column entrance_fee type numeric
  using (case when entrance_fee ~ '^[0-9]+(\.[0-9]+)?$' then entrance_fee::numeric else null end);

alter table public.routes
  alter column estimated_budget type numeric
  using (case when estimated_budget ~ '^[0-9]+(\.[0-9]+)?$' then estimated_budget::numeric else null end);
