import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Storefront, Flag, Eye, CheckCircle, XCircle, Star } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { bulkReviewBusinesses, type BulkBusinessAction } from "@/lib/bulk-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BulkActionBar } from "@/components/admin/bulk-action-bar";
import { CharCount } from "@/components/business/business-fields";
import { AdminIconAction, AdminIconActions } from "@/components/admin/admin-icon-action";
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
import { usePageTitle } from "@/lib/page-title";

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

// Extracted from a nested ternary (option === "all" ? ... : option ===
// "featured" ? ... : ...) inline in the Featured status filter's option
// labels below.
function featuredFilterOptionLabel(option: (typeof FEATURED_OPTIONS)[number]): string {
  if (option === "all") return "All listings";
  if (option === "featured") return "Featured";
  return "Listed";
}

// PrioritizedBusiness (from business-queue-priority.ts) only carries the
// fields the priority function needs. The table also displays name,
// business_type, and featured_status, which are joined back in from the
// original row after prioritizing, so this page's list state needs both.
interface BusinessRow extends PrioritizedBusiness {
  name: string;
  business_type: string;
  featured_status: "listed" | "featured";
}

// What each bulk action applies to, and its wording. Verify/Reject only make
// sense for pending businesses; Feature/Unfeature for the other featured
// state. Selected rows that don't qualify are skipped, and the dialog says so.
const BULK_ACTIONS: Record<
  BulkBusinessAction,
  { title: string; verb: string; appliesTo: (b: BusinessRow) => boolean; blurb: string }
> = {
  verify: {
    title: "Verify",
    verb: "Verify",
    appliesTo: (b) => b.verificationStatus === "pending",
    blurb: "Each business will be marked verified and visible to the public.",
  },
  reject: {
    title: "Reject",
    verb: "Reject",
    appliesTo: (b) => b.verificationStatus === "pending",
    blurb: "Explain what needs to change. The same note is recorded on every business.",
  },
  feature: {
    title: "Feature",
    verb: "Feature",
    appliesTo: (b) => b.featured_status !== "featured",
    blurb: "Each business will be marked Featured.",
  },
  unfeature: {
    title: "Unfeature",
    verb: "Unfeature",
    appliesTo: (b) => b.featured_status === "featured",
    blurb: "Each business will go back to Listed.",
  },
};

export default function AdminBusinessesPage() {
  usePageTitle("Businesses");
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [businesses, setBusinesses] = useState<BusinessRow[] | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [featuredFilter, setFeaturedFilter] = useState<(typeof FEATURED_OPTIONS)[number]>("all");

  // Bulk actions: checked ids (AdminDataTable's `selection`, remembered
  // across table pages and filters), and the confirm dialog the bar opens.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<BulkBusinessAction | null>(null);
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

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

    void load();
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

  // Selection survives filtering, so some checked rows can be out of view.
  // A bulk action still reaches every checked row it applies to, so say how
  // many are hidden.
  const visibleIds = new Set(filtered.map((b) => b.id));
  const hiddenSelected = [...selectedIds].filter((id) => !visibleIds.has(id)).length;
  const selectedRows = (businesses ?? []).filter((b) => selectedIds.has(b.id));
  const countFor = (action: BulkBusinessAction) =>
    selectedRows.filter(BULK_ACTIONS[action].appliesTo).length;

  function openBulkDialog(action: BulkBusinessAction) {
    setBulkAction(action);
    setBulkNotes("");
    setBulkError(null);
  }

  async function handleBulkSubmit() {
    if (!bulkAction || !profile) return;
    const targets = selectedRows.filter(BULK_ACTIONS[bulkAction].appliesTo);
    setBulkSubmitting(true);
    setBulkError(null);
    try {
      await bulkReviewBusinesses({
        action: bulkAction,
        notes: bulkNotes,
        staffId: profile.id,
        ids: targets.map((b) => b.id),
      });
      const done = new Set(targets.map((b) => b.id));
      setBusinesses((prev) =>
        (prev ?? []).map((b) => {
          if (!done.has(b.id)) return b;
          if (bulkAction === "verify") return { ...b, verificationStatus: "verified" };
          if (bulkAction === "reject") return { ...b, verificationStatus: "unverified" };
          return { ...b, featured_status: bulkAction === "feature" ? "featured" : "listed" };
        })
      );
      setSelectedIds(new Set());
      setBulkAction(null);
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : "Could not save the changes.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  const bulkTargetCount = bulkAction ? countFor(bulkAction) : 0;
  const bulkSkipped = selectedIds.size - bulkTargetCount;
  let bulkSubmitLabel = bulkAction ? BULK_ACTIONS[bulkAction].verb : "";
  if (bulkSubmitting) bulkSubmitLabel = "Submitting…";

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
        <AdminIconActions>
          <AdminIconAction icon={Eye} label="View" onClick={() => navigate(`/admin/businesses/${business.id}`)} />
          {business.verificationStatus === "pending" && (
            <>
              <AdminIconAction
                icon={CheckCircle}
                label="Verify"
                onClick={() => navigate(`/admin/businesses/${business.id}?review=verify`)}
              />
              <AdminIconAction
                icon={XCircle}
                label="Reject"
                onClick={() => navigate(`/admin/businesses/${business.id}?review=reject`)}
              />
            </>
          )}
          <AdminIconAction
            icon={Star}
            weight={business.featured_status === "featured" ? "fill" : "regular"}
            label={business.featured_status === "featured" ? "Unfeature" : "Feature"}
            onClick={() => navigate(`/admin/businesses/${business.id}?toggle=featured`)}
          />
        </AdminIconActions>
      ),
    },
  ];

  return (
    <div className="relative flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Businesses</h1>
      </div>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={businesses === null}
        keyField="id"
        autoPageSize
        selection={{ selectedIds, onChange: setSelectedIds }}
        emptyIcon={Storefront}
        empty={businesses && businesses.length > 0 ? "Matching businesses will appear here." : "Businesses will appear here."}
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
                    {featuredFilterOptionLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminFilterBar>
        }
      />

      <BulkActionBar
        count={selectedIds.size}
        detail={hiddenSelected > 0 ? `${hiddenSelected} hidden by filters` : undefined}
        onClear={() => setSelectedIds(new Set())}
      >
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={countFor("reject") === 0}
          onClick={() => openBulkDialog("reject")}
        >
          <XCircle className="h-4 w-4" />
          Reject ({countFor("reject")})
        </Button>
        <Button
          size="sm"
          className="gap-1"
          disabled={countFor("verify") === 0}
          onClick={() => openBulkDialog("verify")}
        >
          <CheckCircle className="h-4 w-4" />
          Verify ({countFor("verify")})
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={countFor("feature") === 0}
          onClick={() => openBulkDialog("feature")}
        >
          <Star className="h-4 w-4" />
          Feature ({countFor("feature")})
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={countFor("unfeature") === 0}
          onClick={() => openBulkDialog("unfeature")}
        >
          <Star weight="fill" className="h-4 w-4" />
          Unfeature ({countFor("unfeature")})
        </Button>
      </BulkActionBar>

      <Dialog open={bulkAction !== null} onOpenChange={(open) => !open && !bulkSubmitting && setBulkAction(null)}>
        <DialogContent>
          {bulkAction && (
            <DialogHeader>
              <DialogTitle>
                {BULK_ACTIONS[bulkAction].title} {bulkTargetCount}{" "}
                {bulkTargetCount === 1 ? "business" : "businesses"}?
              </DialogTitle>
              <DialogDescription>
                {BULK_ACTIONS[bulkAction].blurb}
                {bulkSkipped > 0 &&
                  ` ${bulkSkipped} of your ${selectedIds.size} selected ${
                    bulkSkipped === 1 ? "doesn't" : "don't"
                  } apply and will be left as is.`}
              </DialogDescription>
            </DialogHeader>
          )}

          {bulkAction === "reject" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bulk-review-notes">Review Notes</Label>
              <Textarea
                id="bulk-review-notes"
                value={bulkNotes}
                onChange={(e) => setBulkNotes(e.target.value)}
                placeholder="Reason for rejection"
                required
                maxLength={1000}
              />
              <CharCount value={bulkNotes} max={1000} />
            </div>
          )}

          {bulkError && <p className="text-sm text-destructive">{bulkError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAction(null)} disabled={bulkSubmitting}>
              Cancel
            </Button>
            <Button
              variant={bulkAction === "reject" ? "destructive" : "default"}
              onClick={handleBulkSubmit}
              disabled={bulkSubmitting || (bulkAction === "reject" && bulkNotes.trim().length === 0)}
              loading={bulkSubmitting}
            >
              {bulkSubmitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
