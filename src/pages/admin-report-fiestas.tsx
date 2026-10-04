import { useEffect, useMemo, useState } from "react";
import { FlagBanner } from "@phosphor-icons/react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { usePageTitle } from "@/lib/page-title";
import { BARANGAYS } from "@/lib/fiestas";
import { ReportDownloadMenu } from "@/components/admin/report-download-menu";
import type { ReportTable } from "@/lib/report-files";

// Reports > Fiesta coverage. Answers a question the Fiestas page cannot: which
// of the 30 barangays have no fiesta entered, or only drafts. The Fiestas page
// lists fiestas that exist, so a barangay with none has no row there. This page
// has one row per barangay, zeros included, and shows no fiesta names or dates.
// Counts come from report_fiesta_coverage() (migration 0045), a counts-only
// definer function, because a view_reports-only staff member cannot read draft
// fiestas through RLS. The barangay list is the closed list in fiestas.ts.
//
// Layout: a table view in AdminDataTable, like the Fiestas list, with the same
// toolbar: a search row (barangay name) and the status filter. admin.tsx
// bounds this route (BOUNDED_LIST_ROUTES), so the page fits the viewport and
// the table pages itself to the space left instead of scrolling the page.

interface CoverageRow {
  barangay: string | null; // null: fiestas with no barangay tag
  published_count: number;
  draft_count: number;
}

type Status = "published" | "draft_only" | "none";
type StatusFilter = "all" | Status;

const STATUS_LABEL: Record<Status, string> = {
  published: "Published",
  draft_only: "Draft only",
  none: "No fiesta",
};
const STATUS_BADGE: Record<Status, "default" | "outline" | "destructive"> = {
  published: "default",
  draft_only: "outline",
  none: "destructive",
};
const FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All barangays",
  none: "No fiesta",
  draft_only: "Draft only",
  published: "Published",
};
// Gaps first, so the page opens on what still needs entering or confirming.
const STATUS_ORDER: Record<Status, number> = { none: 0, draft_only: 1, published: 2 };

interface Row {
  name: string;
  published: number;
  draft: number;
  status: Status;
  /** STATUS_ORDER of the status, so the Status column sorts gaps first. */
  order: number;
}

const COLUMNS: AdminColumn<Row>[] = [
  { key: "name", label: "Barangay", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  {
    key: "published",
    label: "Published",
    align: "right",
    width: "140px",
    render: (r) => <span className="tabular-nums text-foreground">{r.published}</span>,
  },
  {
    key: "draft",
    label: "Draft",
    align: "right",
    width: "140px",
    render: (r) => <span className="tabular-nums text-muted-foreground">{r.draft}</span>,
  },
  {
    key: "status",
    label: "Status",
    sortKey: "order",
    width: "170px",
    render: (r) => (
      <Badge variant={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
    ),
  },
];

function statusOf(published: number, draft: number): Status {
  if (published > 0) return "published";
  return draft > 0 ? "draft_only" : "none";
}

async function loadCoverage(): Promise<CoverageRow[]> {
  const { data, error } = await supabase.rpc("report_fiesta_coverage");
  if (error) throw new Error(`Could not load report data: ${error.message}`);
  return (data ?? []) as CoverageRow[];
}

export default function AdminReportFiestasPage() {
  usePageTitle("Fiesta coverage");

  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadCoverage()
      .then((rows) => {
        if (!cancelled) setCoverage(rows);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // All 30 barangays, zeros filled in for the ones the function did not return.
  const rows = useMemo<Row[]>(() => {
    const byName = new Map(coverage.filter((c) => c.barangay).map((c) => [c.barangay as string, c]));
    return BARANGAYS.map((name) => {
      const c = byName.get(name);
      const published = c?.published_count ?? 0;
      const draft = c?.draft_count ?? 0;
      const status = statusOf(published, draft);
      return { name, published, draft, status, order: STATUS_ORDER[status] };
    }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [coverage]);

  const untagged = coverage.find((c) => c.barangay === null);
  const counts = {
    published: rows.filter((r) => r.status === "published").length,
    draft_only: rows.filter((r) => r.status === "draft_only").length,
    none: rows.filter((r) => r.status === "none").length,
  };
  const query = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) => (filter === "all" || r.status === filter) && (!query || r.name.toLowerCase().includes(query)),
  );
  const loadFailed = error !== null;

  // What the download holds: the rows on screen, so the filter and the search carry over.
  function reportTable(): ReportTable {
    const notes = ["A published fiesta is one CATO confirmed. A fiesta tagged to several barangays counts under each of them."];
    if (untagged) {
      notes.push(
        `${untagged.published_count} published and ${untagged.draft_count} draft fiestas have no barangay tag (city-wide, or a community only), so they are not in the rows.`,
      );
    }
    return {
      title: "Fiesta coverage",
      details: [
        `${counts.published} of ${BARANGAYS.length} barangays have a published fiesta, ${counts.draft_only} have drafts only, and ${counts.none} have none.`,
        `Showing: ${FILTER_LABEL[filter]}`,
        ...(query ? [`Search: ${search.trim()}`] : []),
        `Made: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      ],
      columns: ["Barangay", "Published", "Draft", "Status"],
      rows: shown.map((r) => [r.name, r.published, r.draft, STATUS_LABEL[r.status]]),
      notes,
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <AdminPageHeader
        title="Fiesta coverage"
        breadcrumb={[{ label: "Reports", to: "/admin/reports" }]}
        actions={<ReportDownloadMenu getTable={reportTable} fileBase="fiesta-coverage" disabled={loading || loadFailed} />}
      />
      <p className="text-sm text-muted-foreground">
        Which barangays have a fiesta entered, and which have only drafts. A published fiesta is one CATO confirmed. A
        fiesta tagged to several barangays counts under each of them.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loadFailed ? (
        <EmptyState icon={FlagBanner} className="flex-1">
          Counts are unavailable until the report data loads.
        </EmptyState>
      ) : (
        <>
          {!loading && (
            <p className="text-sm text-foreground">
              <span className="font-medium">{counts.published} of {BARANGAYS.length}</span> barangays have a published
              fiesta, {counts.draft_only} have drafts only, and {counts.none} have none.
            </p>
          )}
          <AdminDataTable
            columns={COLUMNS}
            rows={shown}
            loading={loading}
            keyField="name"
            autoPageSize
            empty="No barangay matches."
            emptyIcon={FlagBanner}
            toolbar={
              <AdminFilterBar>
                <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by barangay…" />
                <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
                  <SelectTrigger className="w-[170px]" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FILTER_LABEL) as StatusFilter[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {FILTER_LABEL[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AdminFilterBar>
            }
          />
          {untagged && !loading && (
            <p className="text-xs text-muted-foreground">
              {untagged.published_count} published and {untagged.draft_count} draft fiestas have no barangay tag
              (city-wide, or a community only), so they are not in the rows above.
            </p>
          )}
        </>
      )}
    </div>
  );
}
