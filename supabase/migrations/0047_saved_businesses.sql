-- Saved businesses (recommendation-plan.md, Inputs: "saved_businesses does not
-- exist yet"; open-questions.md row 7). Human-approved before writing, per
-- constraints.md's No Silent Overrides rule and architecture-notes.md's
-- never-touch-without-approval list (schema, RLS policies). Logged in
-- decision-log.md as entry #41. This is a new migration, not an edit to 0046,
-- because 0046 may already be applied (decision-log.md entry #40, standing rule).
--
-- What this adds: one table (saved_businesses) and a new body for
-- recommend_items. No existing table, column or policy changes.
--
-- saved_businesses has the shape of saved_places (0007): id, user_id, the
-- business, saved_at, unique per user and business, with the same own-rows-only
-- policy. Two small tables rather than one polymorphic one, the reason 0007
-- gives for saved_places and saved_routes. Not staff writable, so no
-- log_activity trigger (decision-log.md entry #19, 0037 leaves the resident
-- owned tables out).
--
-- recommend_items changes in two places and nowhere else: a business the
-- caller saved is left out of the rows, like a saved place already is, and a
-- saved business joins the caller's own saved places and completed trail stops
-- as a taste source. Signature, return type, weights and every other rule are
-- the 0046 ones. create or replace keeps the existing grants.

create table public.saved_businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique (user_id, business_id)
);

alter table public.saved_businesses enable row level security;

create policy "saved_businesses_own"
  on public.saved_businesses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Body is 0046's (see its ponytail notes on bands, caps, the box test and the
-- test hook), plus the two saved_businesses lines marked below.
create or replace function public.recommend_items(
  lat double precision default null,
  lng double precision default null,
  lim int default 12,
  anchor_kind text default null,
  anchor_id uuid default null
)
returns table (kind text, id uuid, reason text, distance_km double precision)
language plpgsql stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  -- Weights and sizes. Taste sets the coarse order, distance the next, open now
  -- is smallest. pref_pts equals step_pts so a preferred category always lifts
  -- an item at least one step inside its band.
  taste_bands int := 4;           -- rank bands across candidates
  taste_band_pts int := 48;       -- points per band step above the lowest
  taste_missing_pts int := 72;    -- no embedding yet: neutral, the middle of the range
  pref_pts int := 6;              -- item's category is in own preferred_categories
  open_pts int := 12;             -- open now (unknown gets half, shut gets none)
  dist_pts double precision := 36;-- points at distance zero
  -- Distance decay: points * exp(-km / scale). 8 km, not 2: with 2 km, items 1 to 2 km
  -- apart fell into different steps and the same few nearest items won every day
  -- (supabase/recommend_check.sql 2.19 and 2.20 failed on the fixtures). At 8 km
  -- the whole neighbourhood shares a step or two and still ranks a 6 km item below a
  -- 200 m one. Kept in Phase 4: distance does not depend on the vectors.
  dist_scale_km double precision := 8;
  step_pts int := 6;              -- points are cut into steps of this size
  cap_per_category int := 3;
  nearby_km double precision := 10;    -- nearest item farther than this: location is unusable
  similar_min_band int := 2;      -- bands at or above this may say "Similar to"

  uid uuid := auth.uid();
  anchored boolean := anchor_kind is not null and anchor_id is not null;
  now_ts timestamptz;
  day_txt text;
  prefs text[];
begin
  lim := least(30, greatest(1, coalesce(lim, 12)));

  -- Test hook: the clock comes from app.rec_now when set (empty or bad values
  -- fall back to now()), so supabase/recommend_check.sql can pin time.
  begin
    now_ts := coalesce(nullif(current_setting('app.rec_now', true), '')::timestamptz, now());
  exception when others then
    now_ts := now();
  end;
  day_txt := to_char(now_ts at time zone 'Asia/Manila', 'YYYY-MM-DD');

  -- Never reads views_count, saves_count, business_flags, registered_or_informal,
  -- photo rows, description length or listing completeness. Do not add them.
  if uid is not null and not anchored then
    select p.preferred_categories into prefs from public.profiles p where p.id = uid;
  end if;

  return query
  with
  cand as (
    select 'place'::text as k, pl.id as iid, pl.category_id as cid, pc.name as cat,
           pl.latitude as la, pl.longitude as lo,
           public.rec_open_state(pl.operating_hours, now_ts) as st
    from public.places pl
    left join public.place_categories pc on pc.id = pl.category_id
    where pl.verification_status = 'verified'
    union all
    select 'business'::text, b.id, b.category_id, coalesce(bc.name, b.category_text_legacy),
           b.latitude, b.longitude,
           public.rec_open_state(b.opening_hours, now_ts)
    from public.businesses b
    left join public.business_categories bc on bc.id = b.category_id
    where b.verification_status in ('verified', 'pending')
  ),
  -- Eligible: not marked closed, not saved, not hidden, not the anchor.
  elig as (
    select c.*
    from cand c
    where c.st <> 'out'
      and not (anchored and c.k = anchor_kind and c.iid = anchor_id)
      and not exists (
        select 1 from public.saved_places sp
        where sp.user_id = uid and c.k = 'place' and sp.place_id = c.iid)
      and not exists (
        -- 0047: a saved business is left out, like a saved place.
        select 1 from public.saved_businesses sb
        where sb.user_id = uid and c.k = 'business' and sb.business_id = c.iid)
      and not exists (
        select 1 from public.rec_hides h
        where h.user_id = uid and h.kind = c.k and h.item_id = c.iid)
  ),
  -- Haversine km from the caller to each pinned item. The box test is a cheap
  -- gate (0.2 degree is about 22 km). An item outside it gets no distance, so
  -- with a usable location it is left out (it would score about zero anyway).
  dist as (
    select e.*, case
      when lat is not null and lng is not null and e.la is not null and e.lo is not null
           and abs(e.la - lat) <= 0.2 and abs(e.lo - lng) <= 0.2
      then 2 * 6371 * asin(least(1, sqrt(
             sin(radians((e.la - lat) / 2)) ^ 2
             + cos(radians(lat)) * cos(radians(e.la)) * sin(radians((e.lo - lng) / 2)) ^ 2)))
      end as d
    from elig e
  ),
  -- Location is usable when it was sent and the nearest eligible item is within
  -- nearby_km (a tourist still outside Pasig gets the rotated fallback instead).
  loc as (
    select coalesce(min(d) <= nearby_km, false) as ok from dist
  ),
  pool as (
    select d.*, l.ok as loc_ok
    from dist d cross join loc l
    where (l.ok and d.d is not null) or not l.ok
  ),
  -- What defines taste: the anchor alone, or the caller's own saved places,
  -- saved businesses and completed trail stops. Only items that have an
  -- embedding count.
  src as (
    select s.k, s.iid, e.embedding, n.name
    from (
      select 'place'::text as k, sp.place_id as iid
      from public.saved_places sp
      where not anchored and sp.user_id = uid
      union
      -- 0047: a saved business is a taste source.
      select 'business'::text, sb.business_id
      from public.saved_businesses sb
      where not anchored and sb.user_id = uid
      union
      select rs.stop_type, rs.stop_id
      from public.completed_routes cr
      join public.route_stops rs on rs.route_id = cr.route_id
      where not anchored and cr.user_id = uid
      union
      select anchor_kind, anchor_id where anchored
    ) s
    join public.item_embeddings e on e.kind = s.k and e.item_id = s.iid
    left join lateral (
      select pl.name from public.places pl where s.k = 'place' and pl.id = s.iid
      union all
      select b.name from public.businesses b where s.k = 'business' and b.id = s.iid
    ) n on true
  ),
  tv as (
    select avg(embedding) as v from src
  ),
  sim as (
    select p.*, case when tv.v is not null and em.embedding is not null
                     then 1 - (em.embedding <=> tv.v) end as sim_val,
           tv.v is not null as taste_on
    from pool p
    cross join tv
    left join public.item_embeddings em on em.kind = p.k and em.item_id = p.iid
  ),
  -- Rank bands among the candidates that have a similarity. percent_rank gives
  -- ties the same band, so identical items are never split by order.
  banded as (
    select m.*, case when m.sim_val is not null then
             least(taste_bands - 1, floor(percent_rank() over (
               partition by (m.sim_val is not null) order by m.sim_val) * taste_bands)::int)
           end as band
    from sim m
  ),
  scored as (
    select b.*,
      (case when not b.taste_on then 0
            when b.band is null then taste_missing_pts
            else b.band * taste_band_pts end)
      + (case when coalesce(b.cat = any(prefs), false) then pref_pts else 0 end)
      + (case b.st when 'open' then open_pts when 'unknown' then open_pts / 2 else 0 end)
      + (case when b.loc_ok then round(dist_pts * exp(-b.d / dist_scale_km))::int else 0 end)
      as pts
    from banded b
  ),
  stepped as (
    select sc.*,
      sc.pts / step_pts as stp,
      md5(coalesce(uid::text,
                   'g:' || case when sc.loc_ok then round(lat::numeric, 2)::text || ',' || round(lng::numeric, 2)::text
                                else 'none' end)
          || '|' || day_txt || '|' || sc.k || '|' || sc.iid::text) as rot
    from scored sc
  ),
  capped as (
    select sd.*, row_number() over (
      partition by sd.k, coalesce(sd.cid, sd.iid) order by sd.stp desc, sd.rot) as rn
    from stepped sd
  ),
  picked as (
    select * from capped where rn <= cap_per_category
    order by stp desc, rot
    limit lim
  )
  select p.k, p.iid,
    case
      when not anchored and p.taste_on and p.band >= similar_min_band and cl.name is not null
        then 'Similar to ' || cl.name
      when p.loc_ok and p.st = 'open' then 'Open now'
      when p.loc_ok then 'Near you'
    end,
    case when p.loc_ok then p.d end
  from picked p
  left join lateral (
    select s2.name from src s2
    where not anchored and p.band is not null
    order by s2.embedding <=> (select em.embedding from public.item_embeddings em
                               where em.kind = p.k and em.item_id = p.iid)
    limit 1
  ) cl on true
  order by p.stp desc, p.rot;
end
$$;

-- Same reload 0042 to 0046 end with.
notify pgrst, 'reload schema';
