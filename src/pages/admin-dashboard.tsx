import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CaretRight, ClipboardText } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { usePageTitle } from "@/lib/page-title";
import { formatDateTimeNoSeconds } from "@/lib/datetime";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ActivityEntry {
  id: string;
  section: "Places" | "Businesses" | "Discovery content";
  action: string;
  notes: string | null;
  created_at: string;
  staff_name: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  verify: "verified",
  reject: "rejected",
  feature: "featured",
};

const ENTITY_LABEL: Record<ActivityEntry["section"], string> = {
  Places: "a place",
  Businesses: "a business",
  "Discovery content": "discovery content",
};

// Raw shape returned by the place_reviews and business_reviews queries
// below (same selected columns), before mapping into ActivityEntry.
// Supabase types a select(...profiles(display_name)) join as an array even
// for a one-to-one relationship, so profiles comes back as a (possibly
// empty) array here, not a single nullable object.
interface ReviewActivityRow {
  id: string;
  action: string;
  notes: string | null;
  created_at: string;
  profiles: { display_name: string | null }[];
}

// Chart window: one bar per day, today last. Days are bucketed in the
// viewer's own timezone so a late review lands on the day staff saw it.
const CHART_DAYS = 14;

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function chartStart(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (CHART_DAYS - 1));
  return start;
}

interface ChartDay {
  key: string;
  label: string;
  count: number;
}

function bucketByDay(timestamps: string[]): ChartDay[] {
  const start = chartStart();
  const days: ChartDay[] = Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return {
      key: dayKey(date),
      label: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
      count: 0,
    };
  });
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const ts of timestamps) {
    const bucket = byKey.get(dayKey(new Date(ts)));
    if (bucket) bucket.count += 1;
  }
  return days;
}

// "today", "1 day ago", "6 days ago". Whole calendar days in the viewer's
// timezone, so a change at 11pm last night reads "1 day ago", not "today".
function daysAgo(iso: string): string {
  const then = new Date(iso);
  then.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export default function AdminDashboardPage() {
  usePageTitle("Dashboard");
  const { profile } = useAuth();
  const isAdmin = profile?.staff_role === "admin";
  const canPlaces = isAdmin || !!profile?.system_permission?.includes("manage_places");
  const canBusinesses = isAdmin || !!profile?.system_permission?.includes("review_businesses");

  const [placesPending, setPlacesPending] = useState<number | null>(null);
  const [businessesPending, setBusinessesPending] = useState<number | null>(null);
  // updated_at of the stalest pending row in each queue. places and
  // businesses have no created_at column, so this is when the row last
  // changed, not when it was submitted. Flagged discovery content has no
  // timestamp at all and is not part of the Places figure.
  const [placesOldest, setPlacesOldest] = useState<string | null>(null);
  const [businessesOldest, setBusinessesOldest] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  // created_at of every review in the chart window, both queues merged.
  const [reviewTimes, setReviewTimes] = useState<string[] | null>(null);

  // 6.1 (step-4-phases.md): "pending counts for Events (if a pending
  // concept applies) and any flagged Trail content in the Places queue
  // count." Events has no pending/review concept to count — published
  // (draft/live) and lifecycle_status (upcoming/ongoing/past) are both
  // fully staff-controlled with no second reviewer, per admin-panel-spec.md
  // ("no second reviewer required... Staff who builds it can publish
  // directly," the same reasoning step-4-plan.md applies to Events'
  // Trail Publishing section), so there's no "pending" state for staff to
  // be alerted to here — a card counting drafts would misrepresent what
  // this section actually asks staff to act on. Flagged Trail content has
  // no card of its own either: it's explicitly "in the Places queue
  // count," per the same line, not a new number — see the placesPending
  // query below, which now sums both sources, matching what
  // admin-places.tsx's merged queue already lists as one set of open items.
  useEffect(() => {
    // RLS already scopes places/business review access to manage_places /
    // review_businesses / admin, so a query from a staff member without
    // that permission just returns nothing, no need to branch on it here.
    if (canPlaces) {
      void Promise.all([
        supabase.from("places").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
        // Flagged discovery_content rows have no status of their own
        // (0005/0012), a flagged row is by definition an open item, same
        // reasoning admin-places.tsx's merged queue already uses.
        supabase.from("discovery_content").select("id", { count: "exact", head: true }).eq("needs_place_review", true),
      ]).then(([placesRes, flaggedRes]) => {
        setPlacesPending((placesRes.count ?? 0) + (flaggedRes.count ?? 0));
      });
    }
    if (canPlaces) {
      void supabase
        .from("places")
        .select("updated_at")
        .eq("verification_status", "pending")
        .order("updated_at", { ascending: true })
        .limit(1)
        .then(({ data }) => setPlacesOldest(data?.[0]?.updated_at ?? null));
    }
    if (canBusinesses) {
      supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "pending")
        .then(({ count }) => setBusinessesPending(count ?? 0));
      void supabase
        .from("businesses")
        .select("updated_at")
        .eq("verification_status", "pending")
        .order("updated_at", { ascending: true })
        .limit(1)
        .then(({ data }) => setBusinessesOldest(data?.[0]?.updated_at ?? null));
    }

    // Review volume for the chart. Only the timestamp is needed, so this
    // stays a thin query, separate from the 10 row activity feed below.
    const since = chartStart().toISOString();
    void Promise.all([
      canPlaces
        ? supabase.from("place_reviews").select("created_at").gte("created_at", since)
        : Promise.resolve({ data: [] }),
      canBusinesses
        ? supabase.from("business_reviews").select("created_at").gte("created_at", since)
        : Promise.resolve({ data: [] }),
    ]).then(([placeRes, businessRes]) => {
      const rows = [...(placeRes.data ?? []), ...(businessRes.data ?? [])] as { created_at: string }[];
      setReviewTimes(rows.map((r) => r.created_at));
    });

    // place_reviews now covers two reviewed_type values (migration 0014,
    // widened for Phase 5.3's Trail Content review reuse). Query each type
    // separately and filter explicitly, rather than pulling the whole
    // table unfiltered — the pre-6.1 version of this query predates 0014
    // and silently started mixing both types together once that migration
    // landed, mislabeling every discovery_content review as "a place."
    // Both are gated on canPlaces: migration 0013 grants discovery_content
    // review access to manage_places specifically so this same queue's
    // reviewer sees Trail Content activity too, matching admin-places.tsx's
    // merged list and the 6.1 pending count above.
    void Promise.all([
      canPlaces
        ? supabase
            .from("place_reviews")
            .select("id, action, notes, created_at, profiles(display_name)")
            .eq("reviewed_type", "place")
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
      canPlaces
        ? supabase
            .from("place_reviews")
            .select("id, action, notes, created_at, profiles(display_name)")
            .eq("reviewed_type", "discovery_content")
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
      canBusinesses
        ? supabase
            .from("business_reviews")
            .select("id, action, notes, created_at, profiles(display_name)")
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
    ]).then(([placeRes, discoveryRes, businessRes]) => {
      const combined: ActivityEntry[] = [
        ...(placeRes.data ?? []).map((r: ReviewActivityRow) => ({
          id: r.id,
          section: "Places" as const,
          action: r.action,
          notes: r.notes,
          created_at: r.created_at,
          staff_name: r.profiles[0]?.display_name ?? null,
        })),
        ...(discoveryRes.data ?? []).map((r: ReviewActivityRow) => ({
          id: r.id,
          section: "Discovery content" as const,
          action: r.action,
          notes: r.notes,
          created_at: r.created_at,
          staff_name: r.profiles[0]?.display_name ?? null,
        })),
        ...(businessRes.data ?? []).map((r: ReviewActivityRow) => ({
          id: r.id,
          section: "Businesses" as const,
          action: r.action,
          notes: r.notes,
          created_at: r.created_at,
          staff_name: r.profiles[0]?.display_name ?? null,
        })),
      ]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 10);
      setActivity(combined);
    });
  }, [canPlaces, canBusinesses]);

  const chartDays = useMemo(() => bucketByDay(reviewTimes ?? []), [reviewTimes]);
  const chartTotal = chartDays.reduce((sum, d) => sum + d.count, 0);
  const chartMax = Math.max(...chartDays.map((d) => d.count), 1);

  // Things that need a person, most urgent first. Each row opens the queue
  // it counts, so the number always leads to the action.
  interface AttentionRow {
    label: string;
    count: number | null;
    oldest: string | null;
    to: string;
  }
  const attention = [
    canPlaces && { label: "Places and discovery content", count: placesPending, oldest: placesOldest, to: "/admin/places" },
    canBusinesses && { label: "Businesses", count: businessesPending, oldest: businessesOldest, to: "/admin/businesses" },
  ].filter((row): row is AttentionRow => row !== false);
  const attentionLoaded = attention.every((row) => row.count !== null);
  const nothingWaiting = attentionLoaded && attention.every((row) => row.count === 0);

  let attentionBody: ReactNode;
  if (attention.length === 0 || nothingWaiting) {
    attentionBody = (
      <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        Nothing is waiting for review.
      </p>
    );
  } else {
    attentionBody = (
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {attention.map((row) => (
          <li key={row.to}>
            <Link
              to={row.to}
              className="flex items-center justify-between gap-4 p-4 text-sm text-foreground transition-colors hover:bg-muted/50"
            >
              <span className="flex flex-col gap-1">
                <span>{row.label}</span>
                {row.oldest && (row.count ?? 0) > 0 && (
                  <span className="text-xs text-muted-foreground">Oldest edited {daysAgo(row.oldest)}</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{row.count ?? "…"}</Badge>
                <CaretRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  let chartBody: ReactNode;
  if (reviewTimes === null) {
    chartBody = <p className="text-sm text-muted-foreground">Loading…</p>;
  } else if (chartTotal === 0) {
    chartBody = <EmptyState icon={ClipboardText}>Reviews from the last 14 days will appear here.</EmptyState>;
  } else {
    chartBody = (
      <div className="flex flex-col gap-2">
        <div
          role="img"
          aria-label={`${chartTotal} reviews in the last ${CHART_DAYS} days`}
          className="flex h-32 items-end gap-1 border-b border-border"
        >
          {chartDays.map((day) => (
            <div
              key={day.key}
              title={`${day.label}: ${day.count} ${day.count === 1 ? "review" : "reviews"}`}
              className="flex h-full flex-1 items-end"
            >
              <div
                className={day.count === 0 ? "h-px w-full bg-border" : "w-full rounded-sm bg-primary"}
                style={day.count === 0 ? undefined : { height: `${(day.count / chartMax) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{chartDays[0].label}</span>
          <span>{chartDays[chartDays.length - 1].label}</span>
        </div>
      </div>
    );
  }

  let activityBody: ReactNode;
  if (activity === null) {
    activityBody = <p className="text-sm text-muted-foreground">Loading…</p>;
  } else if (activity.length === 0) {
    activityBody = <EmptyState icon={ClipboardText}>Review actions will appear here.</EmptyState>;
  } else {
    // The table is its own container, no card around it.
    activityBody = (
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activity.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-sm text-foreground">{entry.staff_name ?? "Staff"}</TableCell>
                <TableCell className="text-sm text-foreground">
                  {ACTION_LABEL[entry.action] ?? entry.action}
                </TableCell>
                <TableCell className="text-sm text-foreground">{ENTITY_LABEL[entry.section]}</TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                  {entry.notes ?? ""}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                  {formatDateTimeNoSeconds(entry.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Order: what needs action, then the trend, then the reference log.
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Needs review</h2>
        {attentionBody}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-foreground">Reviews, last 14 days</h2>
          {reviewTimes !== null && chartTotal > 0 && (
            <span className="text-xs text-muted-foreground">{chartTotal} total</span>
          )}
        </div>
        {chartBody}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
        {activityBody}
      </section>
    </div>
  );
}
