import { useEffect, useState } from "react";
import { Landmark, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

interface ActivityEntry {
  id: string;
  section: "Places" | "Businesses";
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

// Raw shape returned by both the place_reviews and business_reviews queries
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

  useEffect(() => {
    // RLS already scopes places/business review access to manage_places /
    // review_businesses / admin, so a query from a staff member without
    // that permission just returns nothing, no need to branch on it here.
    if (canPlaces) {
      supabase
        .from("places")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "pending")
        .then(({ count }) => setPlacesPending(count ?? 0));
    }
    if (canBusinesses) {
      supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "pending")
        .then(({ count }) => setBusinessesPending(count ?? 0));
    }

    Promise.all([
      canPlaces
        ? supabase
            .from("place_reviews")
            .select("id, action, notes, created_at, profiles(display_name)")
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
    ]).then(([placeRes, businessRes]) => {
      const combined: ActivityEntry[] = [
        ...(placeRes.data ?? []).map((r: ReviewActivityRow) => ({
          id: r.id,
          section: "Places" as const,
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
              <p className="text-sm text-muted-foreground">Places pending review</p>
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
                  {entry.staff_name ?? "Staff"} {ACTION_LABEL[entry.action] ?? entry.action} a {entry.section === "Places" ? "place" : "business"}
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
