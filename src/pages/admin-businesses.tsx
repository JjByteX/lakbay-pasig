import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flag, MoreHorizontal } from "lucide-react";
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
import {
  computeBusinessQueuePriority,
  type BusinessQueueCandidate,
  type PrioritizedBusiness,
} from "@/lib/business-queue-priority";

// 6.2: columns per build-3-phases-plan.md 6.2 — name, business type,
// verification status, featured status, flagged indicator. Row action menu:
// view, verify, reject, toggle featured. The verify/reject/feature actions
// themselves are later phases (6.6, 6.7); this page only routes to them,
// same deferred pattern admin-places.tsx already uses for its own
// not-yet-built verify/reject dialog.
//
// Search row, status/featured filters, sortable columns, and pagination:
// ported from amkor-ims's DataTable.jsx + FilterStrip.jsx (Components/
// Shared), adapted into AdminDataTable/AdminFilterBar (src/components/
// admin/). Filtering by search text and the two Select dropdowns happens
// client side over the already-fetched `businesses` array, same fetch-on-
// mount shape this page already used — no new data-fetching pattern
// introduced. The priority order computeBusinessQueuePriority produces
// stays the default row order (AdminDataTable leaves rows untouched until
// a column header is clicked), so the review-queue priority this page
// exists to enforce is not disturbed by adding sorting.

const STATUS_VARIANT = {
  pending: "outline",
  verified: "default",
  unverified: "destructive",
} as const;

const STATUS_OPTIONS = ["all", "pending", "verified", "unverified"] as const;
const FEATURED_OPTIONS = ["all", "featured", "listed"] as const;

// PrioritizedBusiness (from business-queue-priority.ts) only carries the
// fields the priority function needs. The table also displays name,
// business_type, and featured_status, which are joined back in from the
// original row after prioritizing, so this page's list state needs both.
interface BusinessRow extends PrioritizedBusiness {
  name: string;
  business_type: string;
  featured_status: "listed" | "featured";
}

export default function AdminBusinessesPage() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<BusinessRow[] | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [featuredFilter, setFeaturedFilter] = useState<(typeof FEATURED_OPTIONS)[number]>("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: rows } = await supabase
        .from("businesses")
        .select("id, name, business_type, description, verification_status, featured_status, submitted_by, updated_at");

      if (!rows || rows.length === 0) {
        if (!cancelled) {
          setBusinesses([]);
          setFlaggedIds(new Set());
        }
        return;
      }

      const businessIds = rows.map((r) => r.id);
      const submitterIds = Array.from(new Set(rows.map((r) => r.submitted_by)));

      // Signals the priority function accepts as optional input, per
      // business-queue-priority.ts's file header: hasPhotos and
      // accountCreatedAt are fetched here, not inside the pure function.
      const [photosRes, profilesRes, flagsRes] = await Promise.all([
        supabase.from("business_photos").select("business_id").in("business_id", businessIds),
        supabase.from("profiles").select("id, created_at").in("id", submitterIds),
        supabase.from("business_flags").select("business_id").in("business_id", businessIds).eq("resolved", false),
      ]);

      const businessIdsWithPhotos = new Set((photosRes.data ?? []).map((p) => p.business_id));
      const createdAtByProfile = new Map(
        (profilesRes.data ?? []).map((p: { id: string; created_at: string | null }) => [
          p.id,
          p.created_at,
        ])
      );
      const flaggedBusinessIds = new Set((flagsRes.data ?? []).map((f) => f.business_id));

      const candidates: BusinessQueueCandidate[] = rows.map((row) => ({
        id: row.id,
        submittedBy: row.submitted_by,
        description: row.description,
        verificationStatus: row.verification_status,
        updatedAt: row.updated_at,
        accountCreatedAt: createdAtByProfile.get(row.submitted_by) ?? null,
        hasPhotos: businessIdsWithPhotos.has(row.id),
      }));

      const prioritized: BusinessRow[] = computeBusinessQueuePriority(candidates).map((p) => {
        const original = rows.find((r) => r.id === p.id)!;
        return {
          ...p,
          name: original.name,
          business_type: original.business_type,
          featured_status: original.featured_status,
        };
      });

      if (!cancelled) {
        setBusinesses(prioritized);
        setFlaggedIds(flaggedBusinessIds);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!businesses) return [];
    const query = search.trim().toLowerCase();
    return businesses.filter((business) => {
      if (query && !business.name.toLowerCase().includes(query) && !business.business_type.toLowerCase().includes(query)) {
        return false;
      }
      if (statusFilter !== "all" && business.verificationStatus !== statusFilter) return false;
      if (featuredFilter !== "all" && business.featured_status !== featuredFilter) return false;
      return true;
    });
  }, [businesses, search, statusFilter, featuredFilter]);

  const columns: AdminColumn<BusinessRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (business) => <span className="font-semibold text-foreground">{business.name}</span>,
    },
    { key: "business_type", label: "Business Type" },
    {
      key: "verificationStatus",
      label: "Verification Status",
      render: (business) => (
        <Badge variant={STATUS_VARIANT[business.verificationStatus as keyof typeof STATUS_VARIANT]}>
          {business.verificationStatus}
        </Badge>
      ),
    },
    {
      key: "featured_status",
      label: "Featured Status",
      render: (business) => (
        <Badge variant={business.featured_status === "featured" ? "accent" : "secondary"}>
          {business.featured_status === "featured" ? "Featured" : "Listed"}
        </Badge>
      ),
    },
    {
      key: "flagged",
      label: "Flagged",
      sortKey: "id",
      render: (business) =>
        flaggedIds.has(business.id) ? (
          <Badge variant="accent" className="gap-1">
            <Flag className="h-3 w-3" />
            Flagged
          </Badge>
        ) : null,
    },
    {
      key: "actions",
      label: "",
      render: (business) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/admin/businesses/${business.id}`)}>
              View
            </DropdownMenuItem>
            {business.verificationStatus === "pending" && (
              <>
                <DropdownMenuItem onClick={() => navigate(`/admin/businesses/${business.id}?review=verify`)}>
                  Verify
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/admin/businesses/${business.id}?review=reject`)}>
                  Reject
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => navigate(`/admin/businesses/${business.id}?toggle=featured`)}>
              {business.featured_status === "featured" ? "Unfeature" : "Feature"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Businesses</h1>
      </div>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={businesses === null}
        keyField="id"
        autoPageSize
        empty={businesses && businesses.length > 0 ? "No businesses match your search and filters." : "No businesses yet."}
        toolbar={
          <AdminFilterBar>
            <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by name or business type…" />
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
            <Select value={featuredFilter} onValueChange={(v) => setFeaturedFilter(v as typeof featuredFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Featured status" />
              </SelectTrigger>
              <SelectContent>
                {FEATURED_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All listings" : option === "featured" ? "Featured" : "Listed"}
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
