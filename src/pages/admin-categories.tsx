import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminDataTable, { type AdminColumn } from "@/components/admin/admin-data-table";
import AdminFilterBar, { AdminSearchInput } from "@/components/admin/admin-filter-bar";
import CategoryFormDialog, { type CategoryFormConfig } from "@/components/admin/category-form-dialog";
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
import * as placeCategories from "@/lib/place-categories";
import * as trailCategories from "@/lib/trail-categories";
import * as eventCategories from "@/lib/event-categories";
import * as placeFacilities from "@/lib/place-facilities";
import * as businessCategories from "@/lib/business-categories";
import { getCategoryIcon, CATEGORY_ICONS } from "@/lib/place-category-icons";
import { getTrailCategoryIcon, TRAIL_CATEGORY_ICONS } from "@/lib/trail-category-icons";
import { getEventCategoryIcon, EVENT_CATEGORY_ICONS } from "@/lib/event-category-icons";
import { getFacilityIcon, FACILITY_ICONS } from "@/lib/place-facility-icons";
import { getBusinessCategoryIcon, BUSINESS_CATEGORY_ICONS } from "@/lib/business-category-icons";
import { usePageTitle } from "@/lib/page-title";

/**
 * Category Directory admin page, Phase 2.3/2.4/2.5 of category-directory-
 * phases.md. One page, not three separate screens, per the plan doc's
 * "one Categories sidebar section, not three" call -- same reasoning
 * admin-place-detail.tsx and admin-business-detail.tsx already apply at
 * the review-history level, applied here at the page level instead.
 *
 * The three content types (Places/Trails/Announcements) are each
 * independently gated by that type's own existing permission (2.4): a
 * staff member with only one of the three sees exactly one segment,
 * matching how they already can't act on the other two content types
 * anywhere else in admin. This page itself is only reachable at all with
 * at least one of the three (App.tsx's any-of ProtectedRoute, Phase 2.2),
 * so "zero visible segments" cannot happen here -- unlike admin.tsx's own
 * top-level "no sections assigned yet" state, which covers the
 * truly-zero-permissions case for the sidebar as a whole.
 *
 * Row shape: icon preview, name, active badge. Add/edit (Phase 3) is wired
 * through the shared CategoryFormDialog.
 *
 * REVISION, post-Phase 4 (direct instruction): Phase 4's manual up/down
 * reorder writing sort_order, and AdminDataTable's own click-to-sort
 * deliberately turned off to avoid desyncing from it, are both removed.
 * Every other admin list page (admin-places.tsx, admin-staff.tsx,
 * admin-trails.tsx, admin-events.tsx) is a search bar plus sortable
 * columns over a client-fetched array, no manual per-row reorder
 * anywhere -- this page matches that shape instead of being the one
 * exception, per the direct request to make it "like other pages that
 * have tables." Default order is alphabetical by name (AdminDataTable's
 * own default un-sorted row order, which is whatever the fetch already
 * returns -- fetchAllCategories in each of the three lib files queries
 * ordered by name, not sort_order, see place-categories.ts's own comment
 * on that change), and every column here sorts normally since there is no
 * more array-index-dependent reorder action to protect against desyncing.
 * sort_order itself stays as a column on each table (not a schema change,
 * out of this instruction's scope) but is no longer read, written, or
 * displayed anywhere in this app.
 *
 * REVISION 2 (direct instruction, "table doesn't stretch down" /
 * "put the segmented control on the left of search inside the table"):
 * the type selector previously lived one level up as a Tabs/TabsList
 * wrapping three separate TabsContent panels, each holding its own
 * AdminDataTable -- the only admin list page with anything between the
 * bounded outlet and AdminDataTable in its render tree (every other list
 * page: page root div -> AdminDataTable, direct child, confirmed by
 * reading each one directly). That extra Tabs/TabsContent flex layer was
 * the structural difference from every working table page, even though
 * both carried the same flex flex-1 min-h-0 flex-col classes on paper.
 * Restructured so the type selector is a small segmented Tabs control
 * living inside AdminFilterBar's toolbar row, to the left of search --
 * same place a Select filter already sits on this same toolbar, and the
 * same toolbar slot admin-places.tsx/admin-staff.tsx already use. One
 * shared AdminDataTable for all three types now, matching every other
 * list page's render tree exactly: page root div -> AdminDataTable,
 * nothing in between. Which type is selected now lives in one piece of
 * page-level state (activeTab) instead of Tabs' own internal
 * defaultValue, since a single shared table needs to read it directly to
 * pick its config, fetch, and columns.
 */

type TabKey = "places" | "facilities" | "business_categories" | "trails" | "events";

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

// One small config object per tab instead of three near-duplicate blocks
// of JSX -- same reasoning Phase 3.1's category-form-dialog.tsx will apply
// to the add/edit modal, applied here first since the list tab already
// needs it. `permission` matches each table's own RLS/route permission
// (place-categories.ts's file comment, admin-panel-spec.md), used only to
// decide whether the tab renders at all, not to gate anything inside it --
// staff_role admin already bypasses every permission check elsewhere in
// this app (protected-route.tsx, admin-sidebar.tsx), matched here too.
const TAB_CONFIG: Record<
  TabKey,
  {
    label: string;
    // Category Directory Expansion, Phase 2.3: explicit singular label for
    // the add/edit dialog's title ("New {dialogLabel}"), rather than
    // deriving it from `label` with a trailing-s regex -- that regex
    // breaks on "Facilities" (not a plain -s plural) and would double the
    // word "Category" for "Business Category" (which already ends in a
    // word other than a bare plural noun). Explicit per tab avoids both,
    // and costs nothing since every tab already has its own config entry.
    dialogLabel: string;
    // Category Directory Expansion, Phase 2.3: explicit noun for the
    // empty-state message ("No {emptyNoun} categories..."), since
    // config.label.toLowerCase() alone would read "No business category
    // categories yet." for the new Business Category tab -- its label
    // already ends in the word "Category," so appending "categories"
    // again doubles it. The other four tabs' emptyNoun matches their
    // existing label.toLowerCase() output exactly, no wording change for
    // them.
    emptyNoun: string;
    permission: "manage_places" | "build_trails" | "publish_events" | "review_businesses";
    fetchAll: () => Promise<CategoryRow[]>;
    getIcon: (iconName: string) => LucideIcon;
    icons: { value: string; label: string; component: LucideIcon }[];
    create: (input: { name: string; icon: string; active: boolean }) => Promise<void>;
    update: (id: string, input: { name: string; icon: string; active: boolean }) => Promise<void>;
  }
> = {
  places: {
    label: "Places",
    dialogLabel: "Place Category",
    emptyNoun: "places",
    permission: "manage_places",
    fetchAll: placeCategories.fetchAllCategories,
    getIcon: getCategoryIcon,
    icons: CATEGORY_ICONS,
    create: placeCategories.createCategory,
    update: placeCategories.updateCategory,
  },
  // Category Directory Expansion, Phase 2.3: same manage_places permission
  // as Places itself, since a facility is Place content (migration 0026's
  // own RLS), not a new content type needing its own permission -- matches
  // place_facilities.ts's (Phase 1.1) own file comment.
  facilities: {
    label: "Facilities",
    dialogLabel: "Facility",
    emptyNoun: "facilities",
    permission: "manage_places",
    fetchAll: placeFacilities.fetchAllCategories,
    getIcon: getFacilityIcon,
    icons: FACILITY_ICONS,
    create: placeFacilities.createCategory,
    update: placeFacilities.updateCategory,
  },
  // Category Directory Expansion, Phase 2.3: review_businesses, the actual
  // permission Businesses already uses (admin-panel-spec.md, migration
  // 0004's own review flow), not manage_places -- a business category is
  // Business content, matching business_categories.ts's (Phase 1.5) own
  // file comment and migration 0027's RLS.
  business_categories: {
    // Bug fix / direct instruction: tab label shortened from "Business
    // Category" to "Business", matching every other tab's plain-noun
    // convention (Places, Facilities, Trails, Announcements) -- this was
    // the one tab whose label still carried "Category" in it. dialogLabel
    // is unchanged ("Business Category" still titles the add/edit dialog,
    // matching Trails' own "Trail Category" and Announcements' own
    // "Announcement Category" dialog-title pattern), and emptyNoun is
    // unchanged too (already "business", not "business category" -- see
    // this type's own field comment above for why).
    label: "Business",
    dialogLabel: "Business Category",
    emptyNoun: "business",
    permission: "review_businesses",
    fetchAll: businessCategories.fetchAllCategories,
    getIcon: getBusinessCategoryIcon,
    icons: BUSINESS_CATEGORY_ICONS,
    create: businessCategories.createCategory,
    update: businessCategories.updateCategory,
  },
  trails: {
    label: "Trails",
    dialogLabel: "Trail Category",
    emptyNoun: "trails",
    permission: "build_trails",
    fetchAll: trailCategories.fetchAllCategories,
    getIcon: getTrailCategoryIcon,
    icons: TRAIL_CATEGORY_ICONS,
    create: trailCategories.createCategory,
    update: trailCategories.updateCategory,
  },
  events: {
    label: "Announcements",
    dialogLabel: "Announcement Category",
    emptyNoun: "announcements",
    permission: "publish_events",
    fetchAll: eventCategories.fetchAllCategories,
    getIcon: getEventCategoryIcon,
    icons: EVENT_CATEGORY_ICONS,
    create: eventCategories.createCategory,
    update: eventCategories.updateCategory,
  },
};

// Category Directory Expansion, Phase 2.3: TAB_ORDER extends to include
// both new tabs in a sensible position, per the expansion phases doc --
// Facilities beside Places (same content type, same permission), Business
// Category beside where Businesses would sit if it had its own top-level
// tab on this page (the sidebar's own Places/Businesses/Announcements/
// Trails order, applied here since this page has no Businesses tab of its
// own to sit directly next to).
const TAB_ORDER: TabKey[] = ["places", "facilities", "business_categories", "trails", "events"];

/**
 * Fetch on mount (same fetch-on-mount, client-array shape every other
 * admin list page already uses, per constraints.md's Inventory Before
 * Suggesting rule), AdminDataTable for the list, plus add and edit
 * (Phase 3) wired through the shared CategoryFormDialog. dialogTarget,
 * search, and activeFilter all reset on every activeTab switch (each is
 * re-created fresh per type below, matching the old per-tab-instance
 * behavior) -- Phase 3.5 asks for "dialogTarget state per tab," each type
 * is still a fully independent list (its own table, its own permission),
 * this just no longer needs a separate component instance per type to get
 * that isolation.
 *
 * REVISION, post-Phase 4 (direct instruction): Phase 4's reorder state
 * (savingReorder, handleMoveRow) and the sort_order/Order column are gone.
 * In their place: a search box and an Active/Inactive filter in the same
 * AdminFilterBar toolbar slot every other admin list page's table already
 * uses (admin-places.tsx, admin-staff.tsx), and every column sortable
 * (AdminDataTable's own default), since there's no more array-index-
 * dependent reorder write for click-to-sort to desync.
 *
 * REVISION 2 (direct instruction): the type selector moved into this same
 * toolbar, to the left of search, as a small segmented Tabs control (not
 * wrapping the table -- see file header). AdminDataTable is now a direct
 * child of the page root, matching every other admin list page's render
 * tree exactly.
 */
const ACTIVE_OPTIONS = ["all", "active", "inactive"] as const;

// Extracted from a nested ternary (option === "all" ? ... : option ===
// "active" ? ... : ...) inline in the Status filter's option labels
// below, same fix admin-businesses.tsx's featuredFilterOptionLabel
// already applied to an identical shape.
function activeFilterOptionLabel(option: (typeof ACTIVE_OPTIONS)[number]): string {
  if (option === "all") return "All statuses";
  if (option === "active") return "Active";
  return "Inactive";
}

export default function AdminCategoriesPage() {
  usePageTitle("Categories");
  const { profile } = useAuth();
  const isAdmin = profile?.staff_role === "admin";

  const visibleTabs = TAB_ORDER.filter(
    (tab) => isAdmin || profile?.system_permission?.includes(TAB_CONFIG[tab].permission)
  );

  // ProtectedRoute already guarantees at least one of the four permissions
  // (manage_places, build_trails, publish_events, review_businesses) or
  // admin to reach this page at all (App.tsx, Category Directory
  // Expansion Phase 2.2), so visibleTabs is never empty here in practice.
  // Falls back to the fixed tab order's first entry if this were ever
  // reached with none.
  const [activeTab, setActiveTab] = useState<TabKey>(visibleTabs[0] ?? TAB_ORDER[0]);
  const config = TAB_CONFIG[activeTab];

  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<(typeof ACTIVE_OPTIONS)[number]>("all");

  // Dialog state: null closed, "new" the add form, any other string the
  // id of the row being edited -- same null/"new"/id shape admin-staff.tsx
  // already established (Phase 3.5's own instruction). Typed as plain
  // string | null, not "new" | string | null: string already includes
  // the "new" literal, so the union added nothing but a Sonar redundant-
  // literal warning -- the "new" case is still distinguished at runtime
  // by the === "new" checks below, the type doesn't need to repeat it.
  const [dialogTarget, setDialogTarget] = useState<string | null>(null);

  function fetchRows() {
    let cancelled = false;
    setRows(null);
    config
      .fetchAll()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    const cancel = fetchRows();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Switching type is a fresh list: clear search/filter/dialog state left
  // over from the previous type, same reasoning a full component remount
  // used to give this for free when each type was its own CategoryTabPanel
  // instance.
  function handleTabChange(next: string) {
    const tab = next as TabKey;
    setActiveTab(tab);
    setSearch("");
    setActiveFilter("all");
    setDialogTarget(null);
  }

  const editingRow = typeof dialogTarget === "string" && dialogTarget !== "new"
    ? (rows ?? []).find((r) => r.id === dialogTarget)
    : undefined;

  // 3.4's client-side uniqueness check needs every other name already in
  // this table, excluding the row currently being edited (a category
  // keeping its own unchanged name isn't a duplicate of itself).
  const existingNames = (rows ?? [])
    .filter((r) => r.id !== dialogTarget)
    .map((r) => r.name);

  const dialogConfig: CategoryFormConfig = {
    label: config.dialogLabel,
    icons: config.icons,
    create: config.create,
    update: config.update,
  };

  // Search plus active/inactive filter over the already-fetched `rows`
  // array, same client-side filter shape admin-places.tsx and
  // admin-staff.tsx's own `filtered` memos already use -- no server
  // round trip on every keystroke, matching every other admin list here.
  const filtered = useMemo(() => {
    if (!rows) return [];
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !row.name.toLowerCase().includes(query)) return false;
      if (activeFilter !== "all") {
        const isActive = activeFilter === "active";
        if (row.active !== isActive) return false;
      }
      return true;
    });
  }, [rows, search, activeFilter]);

  const columns: AdminColumn<CategoryRow>[] = [
    {
      key: "icon",
      label: "Icon",
      sortable: false,
      width: "64px",
      render: (row) => {
        const Icon = config.getIcon(row.icon);
        return <Icon className="h-4 w-4 text-foreground" />;
      },
    },
    {
      key: "name",
      label: "Name",
      render: (row) => <span className="font-semibold text-foreground">{row.name}</span>,
    },
    {
      key: "active",
      label: "Active",
      render: (row) => <Badge variant={row.active ? "default" : "outline"}>{row.active ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialogTarget(row.id)}>Edit</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Categories</h1>
        <Button onClick={() => setDialogTarget("new")}>Add Category</Button>
      </div>

      <AdminDataTable
        columns={columns}
        rows={filtered}
        loading={rows === null}
        keyField="id"
        autoPageSize
        empty={
          rows && rows.length > 0
            ? `No ${config.emptyNoun} categories match your search and filters.`
            : `No ${config.emptyNoun} categories yet.`
        }
        toolbar={
          <AdminFilterBar>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList>
                {visibleTabs.map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    {TAB_CONFIG[tab].label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <AdminSearchInput value={search} onChange={setSearch} placeholder="Search by name…" />
            <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {ACTIVE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {activeFilterOptionLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminFilterBar>
        }
      />

      <CategoryFormDialog
        open={dialogTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDialogTarget(null);
        }}
        categoryId={dialogTarget === "new" ? null : dialogTarget}
        initialValue={editingRow}
        config={dialogConfig}
        existingNames={existingNames}
        onSaved={fetchRows}
      />
    </div>
  );
}
