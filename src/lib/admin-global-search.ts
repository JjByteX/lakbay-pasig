import { supabase } from "./supabase";
import { readEmbeddedName } from "./place-categories";

// Admin/Staff global search (feature-request-phases.md Phase 3). Mirrors
// global-search.ts's exact shape (one function per content type, same
// Promise.all fan-out, same RESULT_LIMIT/ilike/EMPTY pattern), per 3.1's
// instruction to confirm that pattern before building a second one, and
// per constraints.md's Inventory Before Suggesting rule -- this is a
// staff-context sibling, not a replacement, since the two read through
// different RLS policies and return different fields (verification_status,
// featured_status, published/lifecycle_status -- staff needs to see and
// distinguish these, the public bar deliberately does not surface them).
//
// Five content types per 3.2: Places, Businesses, Events, Trails, Staff.
// Each reads through that table's own `_select_staff` policy (places_
// select_staff, businesses_select_staff, routes_select_staff, events_
// select_staff, profiles_select_admin), not the `_select_public` policy
// global-search.ts's functions use -- confirmed directly against each
// migration (0001, 0003, 0004, 0005, 0006) before writing this, per
// constraints.md's No Silent Overrides rule. This is what makes a pending
// place or a draft trail show up here when it never would in the public
// bar: RLS returns exactly the rows the signed-in staff member's own
// permission already allows, the same policy admin-places.tsx/admin-
// businesses.tsx/admin-events.tsx/admin-trails.tsx already query through,
// so no client-side permission branch is needed to decide row visibility.
//
// Staff (profiles) is the one exception: profiles_select_admin (0001,
// via public.is_admin() since 0009) only grants read access to accounts
// with staff_role = 'admin'. A non-admin Staff member's searchStaff call
// returns zero rows under RLS, not an error -- matching admin-panel-
// spec.md's Staff Roles section ("Staff role has no access to this
// section") without needing a client-side isAdmin check here, same
// RLS-does-the-scoping reasoning as the four content tables above.
const RESULT_LIMIT = 5;

export interface AdminSearchPlaceHit {
  kind: "place";
  id: string;
  name: string;
  category: string;
  verification_status: "pending" | "verified" | "rejected";
}

export interface AdminSearchBusinessHit {
  kind: "business";
  id: string;
  name: string;
  category: string | null;
  verification_status: "pending" | "verified";
  featured_status: "listed" | "featured";
}

export interface AdminSearchTrailHit {
  kind: "trail";
  id: string;
  name: string;
  theme: string | null;
  status: "draft" | "published";
}

export interface AdminSearchEventHit {
  kind: "event";
  id: string;
  title: string;
  category: string | null;
  published: boolean;
}

export interface AdminSearchStaffHit {
  kind: "staff";
  id: string;
  display_name: string | null;
  position: string | null;
}

export interface AdminSearchResults {
  places: AdminSearchPlaceHit[];
  businesses: AdminSearchBusinessHit[];
  trails: AdminSearchTrailHit[];
  events: AdminSearchEventHit[];
  staff: AdminSearchStaffHit[];
}

export const EMPTY_ADMIN_SEARCH_RESULTS: AdminSearchResults = {
  places: [],
  businesses: [],
  trails: [],
  events: [],
  staff: [],
};

export function hasAnyAdminResults(results: AdminSearchResults): boolean {
  return (
    results.places.length > 0 ||
    results.businesses.length > 0 ||
    results.trails.length > 0 ||
    results.events.length > 0 ||
    results.staff.length > 0
  );
}

async function searchPlaces(q: string): Promise<AdminSearchPlaceHit[]> {
  // places_select_staff (0003): manage_places or admin. Same embed shape
  // as admin-places.tsx's own load query and global-search.ts's
  // searchPlaces, verification_status added since staff (unlike the
  // public bar) needs to see and distinguish pending/verified/rejected.
  const { data, error } = await supabase
    .from("places")
    .select("id, name, verification_status, place_categories(name)")
    .ilike("name", `%${q}%`)
    .limit(RESULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: "place" as const,
    id: row.id,
    name: row.name,
    category: readEmbeddedName(row.place_categories) ?? "",
    verification_status: row.verification_status as "pending" | "verified" | "rejected",
  }));
}

async function searchBusinesses(q: string): Promise<AdminSearchBusinessHit[]> {
  // businesses_select_staff (0004): review_businesses or admin. Same
  // fields admin-businesses.tsx's own load query selects.
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, business_categories(name), verification_status, featured_status")
    .ilike("name", `%${q}%`)
    .limit(RESULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: "business" as const,
    id: row.id,
    name: row.name,
    category: readEmbeddedName(row.business_categories),
    verification_status: row.verification_status as "pending" | "verified",
    featured_status: row.featured_status as "listed" | "featured",
  }));
}

async function searchTrails(q: string): Promise<AdminSearchTrailHit[]> {
  // routes_select_staff (0005): build_trails or admin. Same fields
  // admin-trails.tsx's own load query selects.
  const { data, error } = await supabase
    .from("routes")
    .select("id, name, trail_categories(name), status")
    .ilike("name", `%${q}%`)
    .limit(RESULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: "trail" as const,
    id: row.id,
    name: row.name,
    theme: readEmbeddedName(row.trail_categories),
    status: row.status as "draft" | "published",
  }));
}

async function searchEvents(q: string): Promise<AdminSearchEventHit[]> {
  // events_select_staff (0006): publish_events or admin. No .eq("published",
  // true) filter here, unlike global-search.ts's searchEvents -- a staff
  // member reviewing Announcements needs to find an unpublished draft by
  // name too, the public bar's own extra filter exists specifically to
  // keep drafts out of the public-facing result set, which doesn't apply
  // to this staff-only search.
  const { data, error } = await supabase
    .from("events")
    .select("id, title, event_categories(name), published")
    .ilike("title", `%${q}%`)
    .limit(RESULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: "event" as const,
    id: row.id,
    title: row.title,
    category: readEmbeddedName(row.event_categories),
    published: row.published,
  }));
}

async function searchStaff(q: string): Promise<AdminSearchStaffHit[]> {
  // profiles_select_admin (0001/0009): admin only. A non-admin Staff
  // member's query returns zero rows under RLS (see file header), which
  // is exactly the "no Staff results" outcome 3.5 requires for a staff
  // member with no Staff section access -- no client-side isAdmin gate
  // needed here, RLS already enforces it. role = 'staff' scopes this to
  // CATO Staff accounts only, matching admin-staff.tsx's own list query,
  // not every profiles row (residents/vendors are not "Staff records").
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, position")
    .eq("role", "staff")
    .ilike("display_name", `%${q}%`)
    .limit(RESULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: "staff" as const,
    id: row.id,
    display_name: row.display_name,
    position: row.position,
  }));
}

/**
 * One call, five independent queries in parallel, grouped result. Same
 * partial-failure isolation as global-search.ts's searchEverything: one
 * group failing (e.g. a 403 from RLS on a table this staff member has no
 * permission for) does not blank the others, it simply comes back empty --
 * which doubles as 3.5's permission-scoping requirement, since RLS itself
 * is what makes an unauthorized group empty, not a client-side filter this
 * function would otherwise need to apply after the fact. No permission
 * argument: unlike admin-sidebar.tsx's NAV_ITEMS filter (which decides
 * what to show before any network call), every group here already reads
 * through its own table's `_select_staff` RLS policy, so passing
 * `profile.system_permission` in would be an unused parameter, not a real
 * second gate -- the query itself is the gate.
 */
export async function searchAdminEverything(query: string): Promise<AdminSearchResults> {
  const q = query.trim();
  if (!q) return EMPTY_ADMIN_SEARCH_RESULTS;

  const [places, businesses, trails, events, staff] = await Promise.all([
    searchPlaces(q).catch(() => []),
    searchBusinesses(q).catch(() => []),
    searchTrails(q).catch(() => []),
    searchEvents(q).catch(() => []),
    searchStaff(q).catch(() => []),
  ]);

  return { places, businesses, trails, events, staff };
}
