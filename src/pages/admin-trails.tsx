import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";

// Phase 4.1 (step-4-phases.md): table — name, theme, status (draft/published)
// badge, stop count. Row action: edit, publish/unpublish if no blocking
// content. Same list-page shape as admin-places.tsx / admin-events.tsx: fetch
// on mount, table, row action dropdown, no invented pattern per
// constraints.md's Inventory Before Suggesting rule.
//
// Phase 5.4 (step-4-phases.md's "Review and Publish step" / step-4-plan.md's
// Publish section): "no blocking content" now means no linked
// discovery_content row with needs_place_review = true (migration 0012's
// trigger, Decision 1). admin-panel-spec.md's Trail Publishing exception is
// explicit this is a publish gate, not a live-content edit — "route it
// through the Places review queue before the Trail goes live" — so the
// check belongs here, at the publish action, not as a side effect of
// reviewing (see admin-discovery-content-review.tsx's reject handler,
// which is log-only for that reason). ux-ui-guidelines.md's Disabled/
// gated rule requires a visible reason and, per step-4-plan.md, a link to
// the blocking content — blockingEntry below carries what's needed to
// build that link.
//
// Search row, status filter, sortable columns, and pagination: ported from
// amkor-ims's DataTable.jsx + FilterStrip.jsx into AdminDataTable/
// AdminFilterBar (src/components/admin/), filtered client side over the
// already-fetched `trails` array. The updated_at-descending order from the
// Supabase query stays the default row order until a column header is
// clicked.

interface TrailRow {
  id: string;
  name: string;
  theme: string | null;
  status: "draft" | "published";
  stop_count: number;
  // First flagged discovery_content row on this trail, if any. Only the
  // first is needed: the gate just needs one link to start from, staff
  // reach the rest via the Places queue itself once there.
  blockingEntry: { id: string; title: string } | null;
}

const STATUS_VARIANT = {
  draft: "outline",
  published: "default",
} as const;

const STATUS_OPTIONS = ["all", "draft", "published"] as const;

export default function AdminTrailsPage() {
  const navigate = useNavigate();
  const [trails, setTrails] = useState<TrailRow[] | null>(null);
  // 5.4: carries an optional link so the blocked-publish message can point
  // straight at the flagged entry, per ux-ui-guidelines.md's Disabled/
  // gated rule and step-4-plan.md's "show which stop's content is
  // blocking, link to it."
  const [toggleError, setToggleError] = useState<{ message: string; link: { href: string; label: string } | null } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");

  useEffect(() => {
    let cancelled = false;
    loadTrails().then((rows) => {
      if (!cancelled) setTrails(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadTrails(): Promise<TrailRow[]> {
    const { data: routes } = await supabase
      .from("routes")
      .select("id, name, theme, status")
      .order("updated_at", { ascending: false });

    if (!routes || routes.length === 0) return [];

    const routeIds = routes.map((r) => r.id);

    const [{ data: stops }, { data: flagged }] = await Promise.all([
      supabase.from("route_stops").select("route_id").in("route_id", routeIds),
      // Phase 5.4: any linked discovery_content still flagged blocks
      // publish, per admin-panel-spec.md's Trail Publishing exception.
      // Ordered so the earliest-created flagged row is a stable "first"
      // pick per trail (discovery_content has no updated_at, per 0005).
      supabase
        .from("discovery_content")
        .select("id, title, route_id")
        .in("route_id", routeIds)
        .eq("needs_place_review", true)
        .order("id", { ascending: true }),
    ]);

    const stopCounts = new Map<string, number>();
    for (const stop of stops ?? []) {
      stopCounts.set(stop.route_id, (stopCounts.get(stop.route_id) ?? 0) + 1);
    }

    const blockingByRoute = new Map<string, { id: string; title: string }>();
    for (const entry of flagged ?? []) {
      if (!blockingByRoute.has(entry.route_id)) {
        blockingByRoute.set(entry.route_id, { id: entry.id, title: entry.title });
      }
    }

    return routes.map((r) => ({
      id: r.id,
      name: r.name,
      theme: r.theme,
      status: r.status,
      stop_count: stopCounts.get(r.id) ?? 0,
      blockingEntry: blockingByRoute.get(r.id) ?? null,
    }));
  }

  // Phase 4.1's stop_count gate, extended in 5.4 with the flagged-content
  // gate. Both block draft -> published; neither applies going the other
  // way, unpublishing a live trail is never blocked.
  async function handleTogglePublish(trail: TrailRow) {
    setToggleError(null);

    if (trail.status === "draft" && trail.stop_count === 0) {
      setToggleError({ message: "Add at least one stop before publishing this trail.", link: null });
      return;
    }

    if (trail.status === "draft" && trail.blockingEntry) {
      setToggleError({
        message: `"${trail.blockingEntry.title}" still needs review before this trail can publish.`,
        link: { href: `/admin/places/discovery/${trail.blockingEntry.id}`, label: "Review it" },
      });
      return;
    }

    setTogglingId(trail.id);
    const nextStatus = trail.status === "draft" ? "published" : "draft";

    const { error } = await supabase
      .from("routes")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", trail.id);

    setTogglingId(null);

    if (error) {
      setToggleError({ message: error.message, link: null });
      return;
    }

    setTrails((prev) =>
      (prev ?? []).map((t) => (t.id === trail.id ? { ...t, status: nextStatus } : t))
    );
  }

  const filtered = useMemo(() => {
    if (!trails) return [];
    const query = search.trim().toLowerCase();
    return trails.filter((trail) => {
      if (query && !trail.name.toLowerCase().includes(query) && !(trail.theme ?? "").toLowerCase().includes(query)) {
        return false;
      }
      if (statusFilter !== "all" && trail.status !== statusFilter) return false;
      return true;
    });
  }, [trails, search, statusFilter]);

  const columns: AdminColumn<TrailRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (trail) => <span className="font-semibold text-foreground">{trail.name}</span>,
    },
    { key: "theme", label: "Theme", render: (trail) => trail.theme ?? "—" },
    {
      key: "status",
      label: "Status",
      render: (trail) => <Badge variant={STATUS_VARIANT[trail.status]}>{trail.status}</Badge>,
    },
    { key: "stop_count", label: "Stops", align: "right" },
    {
      key: "actions",
      label: "",
      render: (trail) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={togglingId === trail.id}>
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/admin/trails/${trail.id}`)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleTogglePublish(trail)}>
              {trail.status === "published" ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Trails</h1>
        <Button onClick={() => navigate("/admin/trails/new")}>New Trail</Button>
      </div>

      {toggleError && (
        <p className="text-sm text-destructive">
          {toggleError.message}
          {toggleError.link && (
            <>
              {" "}
              <Link to={toggleError.link.href} className="underline underline-offset-2">
                {toggleError.link.label}
              </Link>
            </>
          )}
        </p>
      )}

      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={trails === null}
        keyField="id"
        autoPageSize
        empty={trails && trails.length > 0 ? "No trails match your search and filters." : "No trails yet."}
        toolbar={
          <AdminFilterBar>
            <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by name or theme…" />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All statuses" : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminFilterBar>
        }
      />
    </div>
  );
}
