import { useEffect, useMemo, useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportDownloadMenu } from "@/components/admin/report-download-menu";
import type { ReportTable } from "@/lib/report-files";
import { usePageTitle } from "@/lib/page-title";
import {
  fetchVisitPlanning,
  peakMonthsLabel,
  peakWeekSoon,
  peakWeeksLabel,
  type VisitPlanningRow,
} from "@/lib/seasonality";
import { fetchOccasionSources } from "@/lib/seasonality-occasions";
import { matchOccasions, type OccasionSource } from "@/lib/seasonality-reasons";

// Reports > Visit planning (seasonal-visits-plan.md, Phase 3). The Tourism
// Office view: verified-visit counts for the last 12 complete months, so staff
// and cleanup can be planned before Undas or Simbang Gabi. Counts come from
// report_visit_planning() (migration 0006), a counts-only definer function:
// no user is in the data. Only places at the public threshold (30 visits in 12
// months, and 12 months of app history) appear, the same rule as the public
// labels. Counts are Lakbay Pasig visitors, not everyone who went.
//
// Phase 4 adds "Around the same time": published fiestas and events linked to a
// place (related_place_id) that fall in its peak weeks or months, the same rule
// as the public label. Two extra requests for the whole table. If they fail the
// column is simply empty, and the counts still load. Businesses have no link to
// a fiesta or event, so their cell is empty.
//
// Layout follows Fiesta coverage: an AdminDataTable with a search row and one
// filter, bounded in admin.tsx (BOUNDED_LIST_ROUTES).

type Filter = "all" | "soon";

const FILTER_LABEL: Record<Filter, string> = {
  all: "All sites",
  soon: "Peak week in the next 8 weeks",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Row {
  id: string;
  name: string;
  type: string;
  visits: number;
  months: string;
  weeks: string;
  reasons: string;
  soon: boolean;
  nextWeek: boolean;
  monthly: number[];
}

function toRow(r: VisitPlanningRow, sources: Map<string, OccasionSource[]>): Row {
  const reasons =
    r.kind === "place"
      ? matchOccasions(sources.get(r.item_id) ?? [], r.peak_months, r.peak_weeks)
          .map((o) => `${o.name} (${o.when})`)
          .join(", ")
      : "";
  return {
    id: `${r.kind}:${r.item_id}`,
    name: r.name ?? "(removed)",
    type: r.kind === "place" ? "Place" : "Business",
    visits: r.visits_12m,
    months: peakMonthsLabel(r.peak_months) ?? "",
    weeks: peakWeeksLabel(r.peak_weeks) ?? "",
    reasons,
    soon: peakWeekSoon(r.peak_weeks),
    nextWeek: r.busier_next_week,
    monthly: r.monthly,
  };
}

const COLUMNS: AdminColumn<Row>[] = [
  { key: "name", label: "Name", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  { key: "type", label: "Type", width: "110px", render: (r) => <span className="text-muted-foreground">{r.type}</span> },
  {
    key: "visits",
    label: "Visits, 12 months",
    align: "right",
    width: "170px",
    render: (r) => <span className="tabular-nums text-foreground">{r.visits}</span>,
  },
  {
    key: "months",
    label: "Busiest months",
    width: "170px",
    render: (r) => <span className="text-foreground">{r.months || "—"}</span>,
  },
  {
    key: "weeks",
    label: "Peak weeks",
    sortKey: "soon",
    render: (r) => (
      <span className="flex flex-wrap items-center gap-2 text-foreground">
        {r.weeks || "—"}
        {r.nextWeek && <Badge variant="default">Busier next week</Badge>}
        {!r.nextWeek && r.soon && <Badge variant="outline">Coming up</Badge>}
      </span>
    ),
  },
  {
    key: "reasons",
    label: "Around the same time",
    render: (r) => <span className="text-muted-foreground">{r.reasons || "—"}</span>,
  },
];

export default function AdminReportVisitsPage() {
  usePageTitle("Visit planning");

  const [data, setData] = useState<VisitPlanningRow[]>([]);
  const [sources, setSources] = useState<Map<string, OccasionSource[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchVisitPlanning()
      .then((rows) => {
        if (cancelled) return;
        setData(rows);
        // Occasions are extra: a failure leaves the column empty, not the report.
        const placeIds = rows.filter((r) => r.kind === "place").map((r) => r.item_id);
        fetchOccasionSources(placeIds)
          .then((map) => {
            if (!cancelled) setSources(map);
          })
          .catch(() => {});
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

  // Busiest first, so the page opens on the sites that matter most for planning.
  const rows = useMemo(
    () => data.map((r) => toRow(r, sources)).sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)),
    [data, sources],
  );
  const query = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) => (filter === "all" || r.soon || r.nextWeek) && (!query || r.name.toLowerCase().includes(query)),
  );
  const loadFailed = error !== null;

  // What the download holds: the rows on screen, with the monthly counts the
  // table has no room for.
  function reportTable(): ReportTable {
    return {
      title: "Visit planning",
      details: [
        `${rows.length} ${rows.length === 1 ? "site has" : "sites have"} enough verified visits to show (30 in the last 12 months).`,
        `Showing: ${FILTER_LABEL[filter]}`,
        ...(query ? [`Search: ${search.trim()}`] : []),
        `Made: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
      ],
      columns: ["Name", "Type", "Visits, 12 months", "Busiest months", "Peak weeks", "Around the same time", ...MONTHS],
      rows: shown.map((r) => [r.name, r.type, r.visits, r.months, r.weeks, r.reasons, ...r.monthly]),
      notes: [
        "Counts are verified visits (a stop opened by GPS, or a QR code scanned) among Lakbay Pasig visitors, over the last 12 complete months. They are not everyone who went.",
        "A site with fewer than 30 visits, or any site while the app is under 12 months old, is left out.",
        "Peak weeks are 7-day buckets from Jan 1 and run a day later after Feb 29 in a leap year.",
        "Around the same time lists published fiestas and events linked to the place that fall in its peak weeks (or peak months, when it has no peak weeks). It shows timing, not cause. Businesses are not linked to fiestas or events.",
      ],
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <AdminPageHeader
        title="Visit planning"
        breadcrumb={[{ label: "Reports", to: "/admin/reports" }]}
        actions={<ReportDownloadMenu getTable={reportTable} fileBase="visit-planning" disabled={loading || loadFailed} />}
      />
      <p className="text-sm text-muted-foreground">
        Verified visits over the last 12 months, and the weeks each site is usually busiest, to plan staff and cleanup
        ahead of Undas, Simbang Gabi and fiestas. Counts are Lakbay Pasig visitors, not everyone who went. Sites under 30
        visits are left out.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loadFailed ? (
        <EmptyState icon={CalendarBlank} className="flex-1">
          Visit counts are unavailable until the report data loads.
        </EmptyState>
      ) : (
        <AdminDataTable
          columns={COLUMNS}
          rows={shown}
          loading={loading}
          keyField="id"
          autoPageSize
          empty={
            rows.length === 0
              ? "Nothing to show yet. A site appears once it has 30 verified visits in 12 months and the app has 12 months of history."
              : "No site matches."
          }
          emptyIcon={CalendarBlank}
          toolbar={
            <AdminFilterBar>
              <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by name…" />
              <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <SelectTrigger className="w-[240px]" aria-label="Show">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FILTER_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminFilterBar>
          }
        />
      )}
    </div>
  );
}
