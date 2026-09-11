import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
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
import { countOtherActiveAdmins } from "@/lib/staff-lockout-guard";

// Phase 3.1: table per step-4-phases.md — full name (display_name), position,
// active_status badge, permission summary (badge group). Row action: edit,
// toggle active status. Same list-page shape as admin-businesses.tsx and
// admin-places.tsx: fetch on mount, table, row action dropdown, no invented
// pattern per constraints.md's Inventory Before Suggesting rule.
//
// Access: this whole page only renders for staff_role === 'admin', per
// protected-route.tsx's requireAdmin on the /admin/staff route (App.tsx),
// so every row here is fair game for the Admin to edit, no extra
// permission check needed inside the page itself.
//
// Search row, role/status filters, sortable columns, and pagination:
// ported from amkor-ims's DataTable.jsx + FilterStrip.jsx into
// AdminDataTable/AdminFilterBar (src/components/admin/), filtered client
// side over the already-fetched `staff` array. The display_name-ascending
// order from the Supabase query stays the default row order until a
// column header is clicked.

interface StaffRow {
  id: string;
  display_name: string | null;
  position: string | null;
  staff_role: "staff" | "admin";
  active_status: "active" | "inactive";
  system_permission: string[] | null;
}

const PERMISSION_LABEL: Record<string, string> = {
  manage_places: "Places",
  review_businesses: "Businesses",
  publish_events: "Events",
  build_trails: "Trails",
};

const ROLE_OPTIONS = ["all", "staff", "admin"] as const;
const ACTIVE_OPTIONS = ["all", "active", "inactive"] as const;

export default function AdminStaffPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_OPTIONS)[number]>("all");
  const [activeFilter, setActiveFilter] = useState<(typeof ACTIVE_OPTIONS)[number]>("all");

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("profiles")
      .select("id, display_name, position, staff_role, active_status, system_permission")
      .not("staff_role", "is", null)
      .order("display_name", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setStaff((data ?? []) as StaffRow[]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 3.5: self-lockout guard. An Admin deactivating their own account
  // must not be allowed to do so with no other active Admin left, per
  // step-4-phases.md 3.5 and ux-ui-guidelines.md's Disabled/gated rule
  // (block with a clear message, don't let it through silently). This is
  // the row-action entry point; admin-staff-detail.tsx repeats the same
  // check for the edit form's own toggle, since both surfaces can trigger
  // the same action.
  async function handleToggleActive(row: StaffRow) {
    setToggleError(null);

    if (row.id === profile?.id && row.active_status === "active") {
      const others = await countOtherActiveAdmins(row.id);
      if (others === 0) {
        setToggleError(
          "You're the only active Admin. Deactivating your own account would lock everyone out, so this is blocked."
        );
        return;
      }
    }

    setTogglingId(row.id);
    const nextStatus = row.active_status === "active" ? "inactive" : "active";

    const { error } = await supabase
      .from("profiles")
      .update({ active_status: nextStatus })
      .eq("id", row.id);

    setTogglingId(null);

    if (error) {
      setToggleError(error.message);
      return;
    }

    setStaff((prev) =>
      (prev ?? []).map((s) => (s.id === row.id ? { ...s, active_status: nextStatus } : s))
    );
  }

  const filtered = useMemo(() => {
    if (!staff) return [];
    const query = search.trim().toLowerCase();
    return staff.filter((row) => {
      if (
        query &&
        !(row.display_name ?? "").toLowerCase().includes(query) &&
        !(row.position ?? "").toLowerCase().includes(query)
      ) {
        return false;
      }
      if (roleFilter !== "all" && row.staff_role !== roleFilter) return false;
      if (activeFilter !== "all" && row.active_status !== activeFilter) return false;
      return true;
    });
  }, [staff, search, roleFilter, activeFilter]);

  const columns: AdminColumn<StaffRow>[] = [
    {
      key: "display_name",
      label: "Full Name",
      render: (row) => <span className="font-semibold text-foreground">{row.display_name ?? "—"}</span>,
    },
    { key: "position", label: "Position", render: (row) => row.position ?? "—" },
    {
      key: "staff_role",
      label: "Role",
      render: (row) => <span className="capitalize">{row.staff_role}</span>,
    },
    {
      key: "system_permission",
      label: "Permissions",
      sortable: false,
      render: (row) =>
        row.staff_role === "admin" ? (
          <span className="text-sm text-muted-foreground">All sections</span>
        ) : row.system_permission && row.system_permission.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.system_permission.map((p) => (
              <Badge key={p} variant="secondary">
                {PERMISSION_LABEL[p] ?? p}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        ),
    },
    {
      key: "active_status",
      label: "Active Status",
      render: (row) => (
        <Badge variant={row.active_status === "active" ? "default" : "outline"}>{row.active_status}</Badge>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={togglingId === row.id}>
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/admin/staff/${row.id}`)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleToggleActive(row)}>
              {row.active_status === "active" ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Staff</h1>
        <Button onClick={() => navigate("/admin/staff/new")}>New Staff Account</Button>
      </div>

      {toggleError && <p className="text-sm text-destructive">{toggleError}</p>}

      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={staff === null}
        keyField="id"
        autoPageSize
        empty={staff && staff.length > 0 ? "No staff accounts match your search and filters." : "No staff accounts yet."}
        toolbar={
          <AdminFilterBar>
            <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by name or position…" />
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All roles" : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {ACTIVE_OPTIONS.map((option) => (
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
