import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";
import { usePageTitle } from "@/lib/page-title";
import { toDateOnlyValue } from "@/lib/datetime";

// Activity (activity-log-phases.md Phase 4): read only table of what staff
// and admins did, backed by activity_log (migration 0037). Admin only, both
// by route guard (App.tsx's requireAdmin) and by RLS
// (activity_log_select_admin), so a non admin never sees a row even if they
// reach the URL. Same list shape as admin-staff.tsx: fetch on mount with a
// cancel flag, AdminDataTable with autoPageSize, AdminFilterBar toolbar,
// client side filtering. No onRowClick and no actions column, nothing here
// is editable, and no card wrapper, AdminDataTable is its own container per
// ux-ui-guidelines.md's Card and Table Rules.

interface ActivityRow {
  id: string;
  actor_name: string;
  actor_role: "staff" | "admin";
  action: string;
  target_type: string;
  target_label: string | null;
  details: ActivityDetails | null;
  created_at: string;
}

// details is one shape, see activity-log-plan.md's Details Shape: `notes` on
// verified/rejected, `changed` on everything that carries a column diff.
// A `changed` entry is null when the column is named but its values were
// left out (over 120 characters, or the photos/stops child rows).
interface ActivityDetails {
  notes?: string;
  changed?: Record<string, { from: unknown; to: unknown } | null>;
}

const ACTION_LABEL: Record<string, string> = {
  signed_in: "Signed in",
  signed_out: "Signed out",
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  verified: "Verified",
  rejected: "Rejected",
  featured: "Featured",
  unfeatured: "Unfeatured",
  published: "Published",
  unpublished: "Unpublished",
  activated: "Activated",
  deactivated: "Deactivated",
  role_changed: "Role changed",
  permission_changed: "Permission changed",
  staff_created: "Staff created",
};

const TARGET_LABEL: Record<string, string> = {
  place: "Place",
  business: "Business",
  event: "Announcement",
  trail: "Trail",
  discovery_content: "Trail content",
  landing_slide: "Landing slide",
  place_category: "Place category",
  trail_category: "Trail category",
  event_category: "Announcement category",
  business_category: "Business category",
  place_facility: "Facility",
  staff: "Staff",
  auth: "Session",
};

const ALL = "all";

// Column names and permission codes both arrive snake_case: manage_places
// reads "Manage places". No permission label map, admin-staff.tsx and
// staff-form-dialog.tsx already hold two copies of that one.
function humanize(value: string): string {
  const spaced = value.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Arrays join with commas, everything else prints as is. An empty value
// reads "none" so "Permission: none to Manage places" stays a sentence.
function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "none";
  if (value === null || value === undefined || value === "") return "none";
  return humanize(String(value));
}

function describeDetails(row: ActivityRow): string {
  const { notes, changed } = row.details ?? {};
  if (notes) return notes;
  if (!changed) return "";
  return Object.entries(changed)
    .map(([column, diff]) =>
      diff ? `${humanize(column)}: ${formatValue(diff.from)} to ${formatValue(diff.to)}` : humanize(column)
    )
    .join("; ");
}

export default function AdminActivityPage() {
  usePageTitle("Activity");
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState(ALL);
  const [actionFilter, setActionFilter] = useState(ALL);
  const [targetFilter, setTargetFilter] = useState(ALL);
  // Date range, "YYYY-MM-DD" from a native date input, "" when unset. Both
  // ends are inclusive, and the strings compare correctly as plain text.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Newest 500 rows, per activity-log-plan.md's Known Gaps (server side
  // paging comes when the log outgrows this). Same cancel flag as
  // admin-staff.tsx's fetchStaff.
  useEffect(() => {
    let cancelled = false;

    supabase
      .from("activity_log")
      .select("id, actor_name, actor_role, action, target_type, target_label, details, created_at")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
          setRows([]);
          return;
        }
        setRows((data ?? []) as ActivityRow[]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // User options come from the loaded rows, so a name only shows up once it
  // has actually done something. Sorted, deduped.
  const userOptions = useMemo(
    () => [...new Set((rows ?? []).map((row) => row.actor_name))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  // Actions offered depend on the selected target: only action values that
  // actually occur on that target_type in the loaded rows, in ACTION_LABEL's
  // order. No target selected falls back to every key ACTION_LABEL knows,
  // same "closed list" set the Select used before this filter existed.
  const actionOptions = useMemo(() => {
    const allActions = Object.keys(ACTION_LABEL);
    if (targetFilter === ALL) return allActions;
    const present = new Set(
      (rows ?? []).filter((row) => row.target_type === targetFilter).map((row) => row.action)
    );
    return allActions.filter((action) => present.has(action));
  }, [rows, targetFilter]);

  // Switching targets can leave a picked action that no longer applies
  // (e.g. "Role changed" while on "Staff", then the target changes to
  // "Place"). Clear back to "All actions" rather than silently keeping a
  // filter that would now hide every row.
  useEffect(() => {
    if (actionFilter !== ALL && !actionOptions.includes(actionFilter)) {
      setActionFilter(ALL);
    }
  }, [actionOptions, actionFilter]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        query &&
        !row.actor_name.toLowerCase().includes(query) &&
        !(row.target_label ?? "").toLowerCase().includes(query)
      ) {
        return false;
      }
      if (userFilter !== ALL && row.actor_name !== userFilter) return false;
      if (actionFilter !== ALL && row.action !== actionFilter) return false;
      if (targetFilter !== ALL && row.target_type !== targetFilter) return false;
      const day = toDateOnlyValue(new Date(row.created_at));
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  }, [rows, search, userFilter, actionFilter, targetFilter, fromDate, toDate]);

  const columns: AdminColumn<ActivityRow>[] = [
    {
      key: "created_at",
      label: "Time",
      render: (row) => new Date(row.created_at).toLocaleString(),
    },
    {
      key: "actor_name",
      label: "User",
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">{row.actor_name}</span>
          <span className="text-sm capitalize text-muted-foreground">{row.actor_role}</span>
        </div>
      ),
    },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <Badge variant={row.action === "signed_in" || row.action === "signed_out" ? "outline" : "secondary"}>
          {ACTION_LABEL[row.action] ?? row.action}
        </Badge>
      ),
    },
    {
      key: "target_type",
      label: "Target",
      render: (row) => (
        <div className="flex flex-col">
          <span className="text-muted-foreground">{TARGET_LABEL[row.target_type] ?? row.target_type}</span>
          {row.target_label && <span className="text-foreground">{row.target_label}</span>}
        </div>
      ),
    },
    {
      key: "details",
      label: "Details",
      sortable: false,
      render: (row) => {
        const text = describeDetails(row);
        return <span title={text}>{text}</span>;
      },
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Activity</h1>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={rows === null}
        keyField="id"
        autoPageSize
        empty={rows && rows.length > 0 ? "No activity matches your filters." : "No activity yet."}
        toolbar={
          <AdminFilterBar>
            <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by user or target…" />
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All users</SelectItem>
                {userOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={targetFilter} onValueChange={setTargetFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All targets</SelectItem>
                {Object.entries(TARGET_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All actions</SelectItem>
                {actionOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ACTION_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
              className="w-[150px] [color-scheme:light] dark:[color-scheme:dark]"
            />
            <Input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
              className="w-[150px] [color-scheme:light] dark:[color-scheme:dark]"
            />
          </AdminFilterBar>
        }
      />
    </div>
  );
}
