import { useEffect, useState } from "react";
import { Landmark, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

interface ActivityEntry {
  id: string;
  section: "Places" | "Businesses" | "Trail Content";
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
  "Trail Content": "Trail Content",
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

export default function AdminDashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.staff_role === "admin";
  const canPlaces = isAdmin || !!profile?.system_permission?.includes("manage_places");
  const canBusinesses = isAdmin || !!profile?.system_permission?.includes("review_businesses");

  const [placesPending, setPlacesPending] = useState<number | null>(null);
  const [businessesPending, setBusinessesPending] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);

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
      Promise.all([
        supabase.from("places").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
        // Flagged discovery_content rows have no status of their own
        // (0005/0012), a flagged row is by definition an open item, same
        // reasoning admin-places.tsx's merged queue already uses.
        supabase.from("discovery_content").select("id", { count: "exact", head: true }).eq("needs_place_review", true),
      ]).then(([placesRes, flaggedRes]) => {
        setPlacesPending((placesRes.count ?? 0) + (flaggedRes.count ?? 0));
      });
    }
    if (canBusinesses) {
      supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "pending")
        .then(({ count }) => setBusinessesPending(count ?? 0));
    }

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
    Promise.all([
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
          section: "Trail Content" as const,
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>

      <div className="flex flex-wrap gap-4">
        {canPlaces && (
          <div className="flex min-w-50 flex-1 items-center gap-3 rounded-lg border border-border bg-card p-4">
            <Landmark className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {placesPending ?? "…"}
              </p>
              {/* Includes flagged Trail content per 6.1 — same merged set
                  admin-places.tsx's queue lists, not two separate numbers. */}
              <p className="text-sm text-muted-foreground">Places queue pending review</p>
            </div>
          </div>
        )}
        {canBusinesses && (
          <div className="flex min-w-50 flex-1 items-center gap-3 rounded-lg border border-border bg-card p-4">
            <Store className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {businessesPending ?? "…"}
              </p>
              <p className="text-sm text-muted-foreground">Businesses pending review</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
        {activity === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No review actions yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {activity.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 p-4">
                <p className="text-sm text-foreground">
                  {entry.staff_name ?? "Staff"} {ACTION_LABEL[entry.action] ?? entry.action} {ENTITY_LABEL[entry.section]}
                </p>
                {entry.notes && (
                  <p className="text-sm text-muted-foreground">{entry.notes}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
