import { supabase } from "./supabase";

// Data for the admin Dashboard (pages/admin-dashboard.tsx). Everything here is
// a plain read, shaped for the page, and each fetcher is gated by the same
// permissions the sidebar uses: RLS already returns nothing a staff member may
// not read, so a gate only saves a query and keeps the panel from showing a
// misleading zero (a person without manage_places can still read verified
// places, which would look like "all places").

export type RangeDays = 7 | 14 | 30;
export const RANGES: readonly RangeDays[] = [7, 14, 30];

export interface DashboardPerms {
  isAdmin: boolean;
  canPlaces: boolean;
  canBusinesses: boolean;
  canEvents: boolean;
  canTrails: boolean;
  canFeedback: boolean;
}

// ---------------------------------------------------------------- dates

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Local midnight, `back` days before today. Days are bucketed in the viewer's
// own timezone so a late review lands on the day staff saw it.
function dayStart(back: number): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - back);
  return start;
}

export interface DayPoint {
  key: string;
  label: string;
  value: number;
}

export interface Trend {
  /** One point per day, today last. */
  series: DayPoint[];
  current: number;
  /** Same length window immediately before, for the delta. */
  previous: number;
}

/** Buckets timestamps fetched for 2 x days into the window and the one before it. */
export function toTrend(timestamps: string[], days: number): Trend {
  const start = dayStart(days - 1);
  const series: DayPoint[] = Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return {
      key: dayKey(date),
      label: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
      value: 0,
    };
  });
  const byKey = new Map(series.map((p) => [p.key, p]));
  const previousStart = dayStart(days * 2 - 1).getTime();
  let previous = 0;
  for (const ts of timestamps) {
    const date = new Date(ts);
    const bucket = byKey.get(dayKey(date));
    if (bucket) bucket.value += 1;
    else if (date.getTime() >= previousStart && date.getTime() < start.getTime()) previous += 1;
  }
  return { series, current: series.reduce((sum, p) => sum + p.value, 0), previous };
}

/** "+12%", "-8%", "No change", or "New" when the window before had none. Null when both are empty. */
export function deltaLabel(current: number, previous: number): string | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return "New";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "No change";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/** "5 minutes ago", "3 hours ago", "2 days ago". */
export function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** Whole calendar days since an ISO time, in the viewer's timezone. */
export function daysSince(iso: string): number {
  const then = new Date(iso);
  then.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86_400_000));
}

// ---------------------------------------------------------------- reads

const PAGE = 1000;
const MAX_PAGES = 20;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

// PostgREST returns at most 1000 rows per request, so a busy month would be
// silently cut short. Pages through until a short page comes back.
async function fetchAllRows<T>(build: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return rows;
}

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw new Error(error.message);
  return n ?? 0;
}

/** created_at of every review in the last 2 x days, places and businesses merged. */
export async function fetchReviewTimes(perms: DashboardPerms, days: number): Promise<string[]> {
  const since = dayStart(days * 2 - 1).toISOString();
  const read = (table: "place_reviews" | "business_reviews") =>
    fetchAllRows<{ created_at: string }>((from, to) =>
      supabase.from(table).select("created_at").gte("created_at", since).order("created_at").range(from, to)
    );
  const [places, businesses] = await Promise.all([
    perms.canPlaces ? read("place_reviews") : Promise.resolve([]),
    perms.canBusinesses ? read("business_reviews") : Promise.resolve([]),
  ]);
  return [...places, ...businesses].map((r) => r.created_at);
}

export interface VisitRow {
  kind: "place" | "business";
  item_id: string;
  visited_at: string;
}

/** Verified visits in the last 2 x days. place_visits is readable by admins only. */
export function fetchVisits(days: number): Promise<VisitRow[]> {
  const since = dayStart(days * 2 - 1).toISOString();
  return fetchAllRows<VisitRow>((from, to) =>
    supabase.from("place_visits").select("kind, item_id, visited_at").gte("visited_at", since).order("visited_at").range(from, to)
  );
}

/** The place or business with the most visits in the last `days` days. */
export async function fetchTopVisited(rows: VisitRow[], days: number): Promise<{ name: string; visits: number } | null> {
  const start = dayStart(days - 1).getTime();
  const tally = new Map<string, { row: VisitRow; visits: number }>();
  for (const row of rows) {
    if (new Date(row.visited_at).getTime() < start) continue;
    const key = `${row.kind}:${row.item_id}`;
    const entry = tally.get(key);
    if (entry) entry.visits += 1;
    else tally.set(key, { row, visits: 1 });
  }
  const top = [...tally.values()].sort((a, b) => b.visits - a.visits)[0];
  if (!top) return null;
  const { data } = await supabase
    .from(top.row.kind === "place" ? "places" : "businesses")
    .select("name")
    .eq("id", top.row.item_id)
    .maybeSingle();
  return data?.name ? { name: data.name as string, visits: top.visits } : null;
}

export interface Queue {
  count: number;
  /** updated_at of the stalest pending row. Places and businesses have no created_at. */
  oldest: string | null;
}

export interface Overview {
  /** Pending places plus flagged trail content, the same number the sidebar shows. */
  places: (Queue & { flagged: number }) | null;
  businesses: Queue | null;
  verified: { verified: number; total: number } | null;
  announcements: { live: number; drafts: number } | null;
  trails: { published: number; drafts: number } | null;
  /** Feedback with status new. oldest is the stalest created_at. */
  feedback: Queue | null;
}

async function pendingQueue(table: "places" | "businesses"): Promise<Queue> {
  const [n, oldest] = await Promise.all([
    count(supabase.from(table).select("id", { count: "exact", head: true }).eq("verification_status", "pending")),
    supabase
      .from(table)
      .select("updated_at")
      .eq("verification_status", "pending")
      .order("updated_at", { ascending: true })
      .limit(1),
  ]);
  return { count: n, oldest: oldest.data?.[0]?.updated_at ?? null };
}

async function newFeedbackQueue(): Promise<Queue> {
  const [n, oldest] = await Promise.all([
    count(supabase.from("feedback").select("id", { count: "exact", head: true }).eq("status", "new")),
    supabase.from("feedback").select("created_at").eq("status", "new").order("created_at", { ascending: true }).limit(1),
  ]);
  return { count: n, oldest: oldest.data?.[0]?.created_at ?? null };
}

export async function fetchOverview(perms: DashboardPerms): Promise<Overview> {
  const { canPlaces, canBusinesses, canEvents, canTrails, canFeedback } = perms;
  const exact = (table: string) => supabase.from(table).select("id", { count: "exact", head: true });

  const [places, flagged, businesses, placeCounts, businessCounts, announcements, trails, feedback] = await Promise.all([
    canPlaces ? pendingQueue("places") : null,
    // A flagged discovery_content row has no status of its own: flagged is open.
    canPlaces ? count(exact("discovery_content").eq("needs_place_review", true)) : 0,
    canBusinesses ? pendingQueue("businesses") : null,
    canPlaces
      ? Promise.all([count(exact("places")), count(exact("places").eq("verification_status", "verified"))])
      : null,
    canBusinesses
      ? Promise.all([count(exact("businesses")), count(exact("businesses").eq("verification_status", "verified"))])
      : null,
    canEvents
      ? Promise.all([
          count(exact("events").eq("published", true).in("lifecycle_status", ["upcoming", "ongoing"])),
          count(exact("events").eq("published", false)),
        ])
      : null,
    canTrails
      ? Promise.all([
          count(exact("routes").eq("personal", false).eq("status", "published")),
          count(exact("routes").eq("personal", false).eq("status", "draft")),
        ])
      : null,
    canFeedback ? newFeedbackQueue() : null,
  ]);

  const verified =
    placeCounts || businessCounts
      ? {
          total: (placeCounts?.[0] ?? 0) + (businessCounts?.[0] ?? 0),
          verified: (placeCounts?.[1] ?? 0) + (businessCounts?.[1] ?? 0),
        }
      : null;

  return {
    // Flagged trail content counts toward the Places queue, as in the sidebar.
    places: places ? { count: places.count + flagged, oldest: places.oldest, flagged } : null,
    businesses,
    verified,
    announcements: announcements ? { live: announcements[0], drafts: announcements[1] } : null,
    trails: trails ? { published: trails[0], drafts: trails[1] } : null,
    feedback,
  };
}

// ---------------------------------------------------------------- coming up

export interface ComingUpItem {
  key: string;
  kind: "Announcement" | "Fiesta";
  title: string;
  date: Date;
  /** Month abbreviation and day for the date chip. Day is null for a month-only fiesta. */
  month: string;
  day: number | null;
  detail: string;
  published: boolean;
  to: string;
}

const HORIZON_DAYS = 90;

function monthAbbr(date: Date): string {
  return date.toLocaleDateString("en-PH", { month: "short" });
}

// Fiestas repeat every year and the year in start_date means nothing (see
// lib/fiesta-dates.ts), so the next time one falls is found from month and day.
function fiestaDate(
  f: { start_date: string | null; end_date: string | null; month: number | null },
  today: Date
): { date: Date; day: number | null } | null {
  const year = today.getFullYear();
  if (f.start_date) {
    const [, m, d] = f.start_date.split("-").map(Number);
    const endParts = f.end_date ? f.end_date.split("-").map(Number) : null;
    const start = new Date(year, m - 1, d);
    const end = endParts ? new Date(year, endParts[1] - 1, endParts[2]) : start;
    if (today >= start && today <= end) return { date: today, day: today.getDate() };
    return { date: today > end ? new Date(year + 1, m - 1, d) : start, day: d };
  }
  if (f.month) {
    if (today.getMonth() + 1 === f.month) return { date: today, day: null };
    const next = new Date(year, f.month - 1, 1);
    return { date: today > next ? new Date(year + 1, f.month - 1, 1) : next, day: null };
  }
  return null;
}

/** Next announcements and fiestas, soonest first, drafts included so staff see what is unpublished. */
export async function fetchComingUp(limit = 8): Promise<ComingUpItem[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + HORIZON_DAYS);

  const [events, fiestas] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, date_time, location, published, lifecycle_status")
      .in("lifecycle_status", ["upcoming", "ongoing"])
      .not("date_time", "is", null)
      .order("date_time", { ascending: true })
      .limit(limit),
    supabase.from("fiestas").select("id, name, date_label, start_date, end_date, month, published"),
  ]);
  if (events.error) throw new Error(events.error.message);
  if (fiestas.error) throw new Error(fiestas.error.message);

  const items: ComingUpItem[] = [];
  for (const e of events.data ?? []) {
    const date = new Date(e.date_time as string);
    const ongoing = e.lifecycle_status === "ongoing";
    items.push({
      key: `event:${e.id}`,
      kind: "Announcement",
      title: e.title,
      date: ongoing ? today : date,
      month: monthAbbr(date),
      day: date.getDate(),
      detail: ongoing
        ? "Ongoing"
        : date.toLocaleString("en-PH", { weekday: "short", hour: "numeric", minute: "2-digit" }) +
          (e.location ? `, ${e.location}` : ""),
      published: e.published,
      to: `/admin/events?event=${e.id}`,
    });
  }
  for (const f of fiestas.data ?? []) {
    const when = fiestaDate(f, today);
    if (!when || when.date > horizon) continue;
    items.push({
      key: `fiesta:${f.id}`,
      kind: "Fiesta",
      title: f.name,
      date: when.date,
      month: monthAbbr(when.date),
      day: when.day,
      detail: f.date_label,
      published: f.published,
      to: `/admin/fiestas?fiesta=${f.id}`,
    });
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, limit);
}

// ---------------------------------------------------------------- activity

export interface ActivityRow {
  id: string;
  who: string;
  action: string;
  target: string;
  label: string | null;
  at: string;
}

const LOG_ACTION: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  verified: "Verified",
  rejected: "Rejected",
  featured: "Featured",
  unfeatured: "Unfeatured",
  published: "Published",
  unpublished: "Unpublished",
  activated: "Activated",
  deactivated: "Deactivated",
  role_changed: "Changed role of",
  permission_changed: "Changed access of",
  staff_created: "Added",
  signed_in: "Signed in",
  signed_out: "Signed out",
};

const LOG_TARGET: Record<string, string> = {
  place: "place",
  business: "business",
  event: "announcement",
  trail: "trail",
  discovery_content: "trail content",
  landing_slide: "landing slide",
  place_category: "place category",
  trail_category: "trail category",
  event_category: "announcement category",
  business_category: "business category",
  place_facility: "facility",
  fiesta: "fiesta",
  staff: "staff account",
  auth: "account",
};

const REVIEW_ACTION: Record<string, string> = { verify: "Verified", reject: "Rejected", feature: "Featured" };

interface ReviewRow {
  id: string;
  action: string;
  created_at: string;
  profiles: { display_name: string | null }[] | { display_name: string | null } | null;
}

function reviewerName(profiles: ReviewRow["profiles"]): string {
  const first = Array.isArray(profiles) ? profiles[0] : profiles;
  return first?.display_name ?? "Staff";
}

/**
 * What staff did, newest first. Admins read the activity log (every action,
 * with the item's name). Anyone else reads the review history they are allowed
 * to see, which has no item names, so the label is empty.
 */
export async function fetchActivity(perms: DashboardPerms, limit = 12): Promise<ActivityRow[]> {
  if (perms.isAdmin) {
    const { data, error } = await supabase
      .from("activity_log")
      .select("id, actor_name, action, target_type, target_label, created_at")
      // Sign in and sign out are not work, the Activity page keeps them.
      .neq("target_type", "auth")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      who: r.actor_name,
      action: LOG_ACTION[r.action] ?? r.action,
      target: LOG_TARGET[r.target_type] ?? r.target_type,
      label: r.target_label,
      at: r.created_at,
    }));
  }

  const select = "id, action, created_at, profiles(display_name)";
  const [places, discovery, businesses] = await Promise.all([
    perms.canPlaces
      ? supabase.from("place_reviews").select(select).eq("reviewed_type", "place").order("created_at", { ascending: false }).limit(limit)
      : null,
    perms.canPlaces
      ? supabase.from("place_reviews").select(select).eq("reviewed_type", "discovery_content").order("created_at", { ascending: false }).limit(limit)
      : null,
    perms.canBusinesses
      ? supabase.from("business_reviews").select(select).order("created_at", { ascending: false }).limit(limit)
      : null,
  ]);
  for (const res of [places, discovery, businesses]) if (res?.error) throw new Error(res.error.message);

  const map = (rows: ReviewRow[] | null | undefined, target: string): ActivityRow[] =>
    (rows ?? []).map((r) => ({
      id: r.id,
      who: reviewerName(r.profiles),
      action: REVIEW_ACTION[r.action] ?? r.action,
      target,
      label: null,
      at: r.created_at,
    }));

  return [
    ...map(places?.data as ReviewRow[] | null, "place"),
    ...map(discovery?.data as ReviewRow[] | null, "trail content"),
    ...map(businesses?.data as ReviewRow[] | null, "business"),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}
