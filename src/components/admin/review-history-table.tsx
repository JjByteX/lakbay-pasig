import { useMemo, useState } from "react";
import { ClipboardText } from "@phosphor-icons/react";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeNoSeconds, parseDateValue, toDateOnlyValue } from "@/lib/datetime";
import { DateField } from "@/components/ui/date-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// The Review History tab on the place and business detail pages: who did what
// to this record, with their notes and when. It used to be a hand-rolled list
// in each page; it is one table now, built on AdminDataTable exactly like the
// admin list pages (admin-businesses.tsx and the rest): a search field and a
// filter and a From/To date range in the toolbar (same controls as
// admin-activity.tsx), sortable headers, the "Showing x-y of z" pagination
// footer once there is more than one page, the empty state, and the
// fit-to-viewport row count.
//
// Sits directly in its tab with nothing around it: AdminDataTable is already
// its own bordered container (ux-ui-guidelines.md, a table is never wrapped in
// a card), and autoPageSize needs the page's bounded outlet, which these sub
// pages have (see admin.tsx).

export interface ReviewHistoryEntry {
  id: string;
  staff_name: string | null;
  // "feature" is business only (6.7), places only ever verify or reject.
  action: "verify" | "reject" | "feature";
  notes: string | null;
  created_at: string;
}

type ReviewAction = ReviewHistoryEntry["action"];

// One label and badge style per action everywhere, per ux-ui-guidelines.md's
// "one label per concept, same style per concept" rule. "feature" uses the
// same accent badge as the Featured badge on the business page and list.
const ACTION_LABEL: Record<ReviewAction, string> = {
  verify: "Verified",
  reject: "Rejected",
  feature: "Featured",
};

const ACTION_VARIANT: Record<ReviewAction, "default" | "destructive" | "accent"> = {
  verify: "default",
  reject: "destructive",
  feature: "accent",
};

const ACTION_ORDER: ReviewAction[] = ["verify", "reject", "feature"];

const columns: AdminColumn<ReviewHistoryEntry>[] = [
  {
    key: "staff_name",
    label: "Staff",
    width: "200px",
    render: (row) => <span className="font-semibold text-foreground">{row.staff_name ?? "Staff"}</span>,
  },
  {
    key: "action",
    label: "Action",
    width: "140px",
    render: (row) => <Badge variant={ACTION_VARIANT[row.action]}>{ACTION_LABEL[row.action]}</Badge>,
  },
  {
    key: "notes",
    label: "Notes",
    sortable: false,
    // Rows are a fixed height, so a long note is cut at two lines. The full
    // text is in the tooltip rather than lost.
    render: (row) =>
      row.notes ? (
        <span title={row.notes} className="line-clamp-2 text-muted-foreground">
          {row.notes}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "created_at",
    label: "Date",
    width: "200px",
    render: (row) => formatDateTimeNoSeconds(row.created_at),
  },
];

export function ReviewHistoryTable({ reviews }: Readonly<{ reviews: ReviewHistoryEntry[] | null }>) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | ReviewAction>("all");
  // Date range, "YYYY-MM-DD" from a native date input, "" when unset. Both ends
  // are inclusive, and the strings compare correctly as plain text (same as
  // admin-activity.tsx).
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Only offer the actions that actually appear, so a place (which is never
  // "featured") does not get a Featured option that can only ever be empty.
  const actionOptions = useMemo(() => {
    const present = new Set((reviews ?? []).map((r) => r.action));
    return ACTION_ORDER.filter((a) => present.has(a));
  }, [reviews]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (reviews ?? []).filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      const day = toDateOnlyValue(new Date(r.created_at));
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      if (!query) return true;
      return (
        (r.staff_name ?? "Staff").toLowerCase().includes(query) ||
        (r.notes ?? "").toLowerCase().includes(query)
      );
    });
  }, [reviews, search, actionFilter, fromDate, toDate]);

  return (
    <AdminDataTable
      columns={columns}
      rows={filtered}
      loading={reviews === null}
      keyField="id"
      autoPageSize
      emptyIcon={ClipboardText}
      empty={
        reviews && reviews.length > 0
          ? "Matching review history will appear here."
          : "Review history will appear here."
      }
      toolbar={
        <AdminFilterBar>
          <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by staff or notes…" />
          <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as typeof actionFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actionOptions.map((action) => (
                <SelectItem key={action} value={action}>
                  {ACTION_LABEL[action]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateField
            value={fromDate}
            maxDate={(toDate ? parseDateValue(toDate) : null) ?? undefined}
            onChange={setFromDate}
            aria-label="From date"
            align="right"
            className="w-[190px]"
          />
          <DateField
            value={toDate}
            minDate={(fromDate ? parseDateValue(fromDate) : null) ?? undefined}
            onChange={setToDate}
            aria-label="To date"
            align="right"
            className="w-[190px]"
          />
        </AdminFilterBar>
      }
    />
  );
}
