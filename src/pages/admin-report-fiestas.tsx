import { useEffect, useMemo, useState } from "react";
import { FlagBanner } from "@phosphor-icons/react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
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
}

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
      return { name, published, draft, status: statusOf(published, draft) };
    }).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
  }, [coverage]);

  const untagged = coverage.find((c) => c.barangay === null);
  const counts = {
    published: rows.filter((r) => r.status === "published").length,
    draft_only: rows.filter((r) => r.status === "draft_only").length,
    none: rows.filter((r) => r.status === "none").length,
  };
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const loadFailed = error !== null;

  // What the download holds: the rows on screen, so the filter carries over.
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
        `Made: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      ],
      columns: ["Barangay", "Published", "Draft", "Status"],
      rows: shown.map((r) => [r.name, r.published, r.draft, STATUS_LABEL[r.status]]),
      notes,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader
        title="Fiesta coverage"
        breadcrumb={[{ label: "Reports", to: "/admin/reports" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[170px]" aria-label="Show">
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
            <ReportDownloadMenu getTable={reportTable} fileBase="fiesta-coverage" disabled={loading || loadFailed} />
          </div>
        }
      />
      <p className="text-sm text-muted-foreground">
        Which barangays have a fiesta entered, and which have only drafts. A published fiesta is one CATO confirmed. A
        fiesta tagged to several barangays counts under each of them.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {loadFailed ? (
        <EmptyState icon={FlagBanner}>Counts are unavailable until the report data loads.</EmptyState>
      ) : !loading ? (
        <>
          <p className="text-sm text-foreground">
            <span className="font-medium">{counts.published} of {BARANGAYS.length}</span> barangays have a published
            fiesta, {counts.draft_only} have drafts only, and {counts.none} have none.
          </p>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="grid grid-cols-[minmax(0,1fr)_72px_72px_110px] gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Barangay</span>
              <span className="text-right">Published</span>
              <span className="text-right">Draft</span>
              <span>Status</span>
            </div>
            {shown.length === 0 ? (
              <EmptyState icon={FlagBanner}>No barangay matches this filter.</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {shown.map((r) => (
                  <li
                    key={r.name}
                    className="grid grid-cols-[minmax(0,1fr)_72px_72px_110px] items-center gap-2 px-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-foreground">{r.name}</span>
                    <span className="text-right tabular-nums text-foreground">{r.published}</span>
                    <span className="text-right tabular-nums text-muted-foreground">{r.draft}</span>
                    <span>
                      <Badge variant={r.status === "published" ? "default" : r.status === "draft_only" ? "outline" : "destructive"}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {untagged && (
            <p className="text-xs text-muted-foreground">
              {untagged.published_count} published and {untagged.draft_count} draft fiestas have no barangay tag
              (city-wide, or a community only), so they are not in the rows above.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
