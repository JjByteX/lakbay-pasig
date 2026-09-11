import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

interface PlaceQueueRow {
  kind: "place";
  id: string;
  name: string;
  category: string;
  verification_status: "pending" | "verified" | "rejected";
  updated_at: string;
}

// Phase 5.3 (step-4-phases.md, step-4-plan.md's review exception): flagged
// discovery_content rows (needs_place_review = true, computed by migration
// 0012's trigger per phase-5-decisions.md Decision 1) surface here as extra
// rows, not a second queue — "reuse the existing table and verify/reject
// actions" is step-4-plan.md's own wording. This row has no
// verification_status of its own (discovery_content's only status column is
// active/inactive, an on/off switch, not a review state), so it is always
// treated as pending: a flagged row is, by definition, an item this queue
// still needs to look at.
interface DiscoveryContentQueueRow {
  kind: "discovery_content";
  id: string;
  title: string;
  trail_name: string;
  related_location_type: "place" | "business";
  related_location_name: string;
  updated_at: string;
}

type QueueRow = PlaceQueueRow | DiscoveryContentQueueRow;

// Shared display name across both row kinds, used by AdminDataTable's
// column render and by the search filter below.
function rowName(row: QueueRow): string {
  return row.kind === "place" ? row.name : row.title;
}

const STATUS_VARIANT = {
  pending: "outline",
  verified: "default",
  rejected: "destructive",
} as const;

// 5.1: oldest pending first, per project-brief.md default sort. Fetch
// unordered, then sort client side by explicit priority so ordering
// doesn't depend on how the status strings happen to alphabetize. 5.3
// extends this: a flagged Trail Content row has no stored status, but it is
// always an open item, so it sorts alongside pending places rather than
// getting its own separate priority tier.
const STATUS_PRIORITY = { pending: 0, verified: 1, rejected: 1 } as const;

const TYPE_OPTIONS = ["all", "place", "discovery_content"] as const;
const STATUS_OPTIONS = ["all", "pending", "verified", "rejected"] as const;

export default function AdminPlacesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_OPTIONS)[number]>("all");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");

  useEffect(() => {
    let cancelled = false;
    loadQueue().then((loaded) => {
      if (!cancelled) setRows(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadQueue(): Promise<QueueRow[]> {
    const [placesRes, flaggedRes] = await Promise.all([
      supabase.from("places").select("id, name, category, verification_status, updated_at"),
      // No updated_at on discovery_content (migration 0005 doesn't define
      // one), so flagged rows have nothing to sort by within their own
      // priority tier except id, same tie-break gap "pending"/"rejected"
      // already share on the places side today.
      supabase
        .from("discovery_content")
        .select("id, title, related_location_type, related_location_id, routes(name)")
        .eq("needs_place_review", true),
    ]);

    const placeRows: PlaceQueueRow[] = ((placesRes.data ?? []) as {
      id: string;
      name: string;
      category: string;
      verification_status: "pending" | "verified" | "rejected";
      updated_at: string;
    }[]).map((p) => ({ kind: "place", ...p }));

    const flagged = (flaggedRes.data ?? []) as {
      id: string;
      title: string;
      related_location_type: "place" | "business";
      related_location_id: string;
      routes: { name: string } | { name: string }[] | null;
    }[];

    // related_location_id has no foreign key (0005, type-plus-id pattern),
    // so its display name is resolved here, the same way place-business-
    // picker.tsx and admin-trail-builder.tsx's StopRow already resolve
    // stop_type/stop_id client side rather than relying on a join Postgres
    // can't express across two possible tables.
    const placeIds = flagged.filter((f) => f.related_location_type === "place").map((f) => f.related_location_id);
    const businessIds = flagged
      .filter((f) => f.related_location_type === "business")
      .map((f) => f.related_location_id);

    const [namedPlacesRes, namedBusinessesRes] = await Promise.all([
      placeIds.length > 0
        ? supabase.from("places").select("id, name").in("id", placeIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      businessIds.length > 0
        ? supabase.from("businesses").select("id, name").in("id", businessIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const locationNames = new Map<string, string>();
    for (const p of namedPlacesRes.data ?? []) locationNames.set(p.id, p.name);
    for (const b of namedBusinessesRes.data ?? []) locationNames.set(b.id, b.name);

    const discoveryRows: DiscoveryContentQueueRow[] = flagged.map((f) => {
      const routeName = Array.isArray(f.routes) ? f.routes[0]?.name : f.routes?.name;
      return {
        kind: "discovery_content",
        id: f.id,
        title: f.title,
        trail_name: routeName ?? "Untitled trail",
        related_location_type: f.related_location_type,
        related_location_name: locationNames.get(f.related_location_id) ?? "Unknown",
        updated_at: "",
      };
    });

    return [...placeRows, ...discoveryRows].sort((a, b) => {
      const aPriority = a.kind === "place" ? STATUS_PRIORITY[a.verification_status] : 0;
      const bPriority = b.kind === "place" ? STATUS_PRIORITY[b.verification_status] : 0;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.updated_at.localeCompare(b.updated_at);
    });
  }

  // Search row, type/status filters, sortable columns, and pagination:
  // ported from amkor-ims's DataTable.jsx + FilterStrip.jsx into
  // AdminDataTable/AdminFilterBar (src/components/admin/), filtered client
  // side over the already-loaded `rows` array — same fetch-on-mount shape
  // this page already used. The default STATUS_PRIORITY ordering computed
  // above stays the default row order (AdminDataTable only re-sorts once a
  // column header is clicked), so this filter/search layer sits on top of
  // the review queue's existing priority order rather than replacing it.
  const filtered = useMemo(() => {
    if (!rows) return [];
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !rowName(row).toLowerCase().includes(query)) return false;
      if (typeFilter !== "all" && row.kind !== typeFilter) return false;
      if (statusFilter !== "all") {
        const rowStatus = row.kind === "place" ? row.verification_status : "pending";
        if (rowStatus !== statusFilter) return false;
      }
      return true;
    });
  }, [rows, search, typeFilter, statusFilter]);

  const columns: AdminColumn<QueueRow>[] = [
    {
      key: "name",
      label: "Name",
      sortKey: "name",
      render: (row) => <span className="font-semibold text-foreground">{rowName(row)}</span>,
    },
    {
      key: "type",
      label: "Type",
      render: (row) => <Badge variant="secondary">{row.kind === "place" ? "Place" : "Trail Content"}</Badge>,
    },
    {
      key: "category",
      label: "Category",
      sortable: false,
      render: (row) =>
        row.kind === "place" ? row.category : `${row.trail_name} · ${row.related_location_name}`,
    },
    {
      key: "verification_status",
      label: "Verification Status",
      render: (row) => {
        const status = row.kind === "place" ? row.verification_status : "pending";
        return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
      },
    },
    {
      key: "updated_at",
      label: "Last Updated",
      render: (row) =>
        row.updated_at ? (
          <span className="text-muted-foreground">{new Date(row.updated_at).toLocaleDateString()}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      label: "",
      render: (row) =>
        row.kind === "place" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/admin/places/${row.id}`)}>View</DropdownMenuItem>
              {row.verification_status === "pending" && (
                <>
                  <DropdownMenuItem onClick={() => navigate(`/admin/places/${row.id}?review=verify`)}>
                    Verify
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/admin/places/${row.id}?review=reject`)}>
                    Reject
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/admin/places/discovery/${row.id}`)}>View</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/admin/places/discovery/${row.id}?review=verify`)}>
                Verify
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/admin/places/discovery/${row.id}?review=reject`)}>
                Reject
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Places</h1>
        <Button onClick={() => navigate("/admin/places/new")}>New Place</Button>
      </div>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={rows === null}
        keyField="id"
        autoPageSize
        empty={rows && rows.length > 0 ? "No places match your search and filters." : "No places yet."}
        toolbar={
          <AdminFilterBar>
            <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by name…" />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All types" : option === "place" ? "Place" : "Trail Content"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Verification status" />
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
