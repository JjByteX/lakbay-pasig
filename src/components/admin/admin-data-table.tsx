import { useMemo, useReducer, useState, type ReactNode } from "react";
import { CaretLeft, CaretRight, CaretUp, CaretDown, CaretUpDown, Tray, type Icon } from "@phosphor-icons/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DiscardSelectionDialog } from "@/components/admin/discard-selection-dialog";
import { SelectScopeDialog } from "@/components/admin/select-scope-dialog";
import { useSelectionNavigationGuard } from "@/hooks/use-selection-navigation-guard";
import { cn } from "@/lib/utils";
import { useAutoPageSize } from "@/hooks/use-auto-page-size";

/**
 * AdminDataTable — shared admin list table: client-side sort, client-side
 * pagination, a toolbar slot for the search row and filters, and skeleton
 * loading rows shaped from the same columns the real rows use.
 *
 * Ported from amkor-ims's Components/Shared/DataTable.jsx (sort state
 * machine, pagination math, search-row and filter-row layout, skeleton
 * rows). That original is an Inertia.js component: it paginates through a
 * Laravel server paginator and tracks in-flight Inertia navigations for its
 * loading state. This app has no server route pagination, every admin list
 * here fetches its full row set from Supabase on mount, per every existing
 * admin-*.tsx page (constraints.md's Inventory Before Suggesting rule — the
 * fetch-on-mount, client-array pattern already exists five times over,
 * ported logic must match it, not introduce a second data-fetching shape).
 * So sorting and pagination here are always client-side over the array the
 * page already loaded; there is no sortingMode/isServerPaginated switch and
 * no per-route remembered page size. `loading` is an explicit prop the page
 * sets itself (its existing rows === null check), not inferred from router
 * events that don't exist in this app.
 *
 * VIEWPORT FIT
 * ────────────
 * Ported from amkor-ims's useAutoPageSize hook (resources/js/hooks/
 * useAutoPageSize.js) into src/hooks/use-auto-page-size.ts: the table
 * measures its own available height and works out how many rows actually
 * fit, so a row that doesn't fit moves to the next page instead of
 * forcing the table (or the page) to scroll. admin.tsx's outlet gives the
 * five list routes a bounded, non-scrolling region (flex-1 min-h-0
 * overflow-hidden, mirroring amkor's AppShell mode="table" <main>)
 * specifically so this measurement has a real, fixed height to measure
 * against — the sub pages (place, business, trail builder, discovery
 * review) get the same bounded region so their card scrolls instead of the
 * page (see admin-form-card.tsx); only the dashboard keeps the plain
 * scrolling outlet, since it has no table or card to fit. Each of the five list
 * pages' own root div also needs flex-1 min-h-0 (not the default block
 * flow) so that bounded height actually reaches this component instead of
 * stopping at the page's own wrapper — see each admin-*.tsx page.
 *
 * Rows are a fixed height, like amkor's 52px: every row is exactly
 * --height-table-row (index.css) and its cell content is clipped to fit, so
 * rows per page is container height minus toolbar, header and pagination,
 * divided by that constant, nothing measured from a rendered row. A row that
 * could grow makes the page size depend on which row is first on the page,
 * and the table then flips between pages forever.
 *
 * Opt-in via the `autoPageSize` prop, matching amkor's own prop name.
 * When false (the default), `pageSize` behaves exactly as before: a fixed
 * page size, table capped at a max height and scrolling internally. The
 * five admin-*.tsx list pages pass autoPageSize; any future table that
 * wants a fixed page size instead (e.g. an embedded table inside a detail
 * page, with no bounded outlet to measure against) can still opt out.
 *
 * ROW SELECTION (bulk actions)
 * ─────────────────────────────
 * Opt-in via the `selection` prop, so every admin list can share it. The
 * page owns the selected ids (it needs them to run its bulk action) and
 * passes `{ selectedIds, onChange, isSelectable? }`. The table adds a
 * leading checkbox column: one checkbox per row, and one in the header that
 * selects (or clears) every selectable row on the current page, showing a
 * dash when only some are checked. The page renders a BulkActionBar for the
 * actions.
 *
 * The selection is remembered for as long as the person stays on the admin
 * page: it survives moving to another table page, re-sorting, and filter or
 * search edits (a checked row that is filtered out stays checked and comes
 * back when it matches again). The header checkbox selects the rows on the
 * current table page; when the list spans more than one page it first asks
 * whether to select only what is shown or every row matching the current
 * search and filters. Ticking it again clears what it selected. Leaving the page (another route, or closing the
 * tab) while rows are checked opens a "Discard your selection?" prompt first,
 * so a checked selection is never lost by accident.
 *
 * Column-driven cells and header, "actions" column auto-detection and
 * centering, and the sort icon set (ChevronUp/Down/ChevronsUpDown) are
 * carried over as-is — same interaction and layout the original list pages
 * relied on. Inline CSS-var styles are replaced with this project's
 * existing Tailwind/shadcn tokens (border-border, text-muted-foreground,
 * text-sm, rounded-md, the 8px spacing scale), per ux-ui-guidelines.md's
 * Consistency Rules (reuse existing tokens, never invent new ones) and
 * Card and Table Rules (a table is its own container, never wrapped in a
 * card — this renders the shadcn <Table> directly, no card wrapper added).
 */

export interface AdminColumn<T> {
  key: string;
  label: string;
  /** Render the cell. Falls back to row[key] when omitted. */
  render?: (row: T) => ReactNode;
  /** Fixed width, e.g. "160px". Actions and right-aligned columns auto-width unless set. */
  width?: string;
  /** Defaults to true. Set false to opt a column out of sorting. */
  sortable?: boolean;
  /** Sort by this field instead of `key`, for render-only columns. */
  sortKey?: string;
  align?: "left" | "right";
}

export interface AdminSelection<T> {
  selectedIds: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Rows that return false get a disabled checkbox and are skipped by
   *  select-all. Default: every row is selectable. */
  isSelectable?: (row: T) => boolean;
}

interface AdminDataTableProps<T> {
  columns: AdminColumn<T>[];
  rows: T[];
  /** Explicit loading flag — pages already track this via `rows === null`. */
  loading?: boolean;
  empty?: ReactNode;
  /** Icon shown above a string `empty` message. Pass the page's sidebar icon. */
  emptyIcon?: Icon;
  /** 0 disables pagination. Default 10, matching ux-ui-guidelines.md's
   * "do not use a data table for fewer than 5 rows" floor by keeping pages
   * small enough that pagination controls earn their place. Ignored while
   * autoPageSize is true and a measurement has landed — see VIEWPORT FIT
   * above. */
  pageSize?: number;
  /** Viewport-driven page size: measures available height and fits as many
   * rows as the space allows instead of using a fixed pageSize. Requires
   * an ancestor that actually constrains height (admin.tsx's bounded
   * outlet + the page's own flex-1 min-h-0 root) — see VIEWPORT FIT. */
  autoPageSize?: boolean;
  keyField?: keyof T & string;
  onRowClick?: (row: T) => void;
  /** Search row, filters, segmented tabs — rendered above the table, inside its own border. */
  toolbar?: ReactNode;
  className?: string;
  /** Opt-in row checkboxes for bulk actions, see ROW SELECTION above. */
  selection?: AdminSelection<T>;
}

const sortInitial = { key: null as string | null, dir: "asc" as "asc" | "desc" };

function sortReducer(
  state: typeof sortInitial,
  clickedKey: string
): typeof sortInitial {
  if (state.key !== clickedKey) return { key: clickedKey, dir: "asc" };
  if (state.dir === "asc") return { key: clickedKey, dir: "desc" };
  return sortInitial;
}

function SortIcon({ active, dir }: Readonly<{ active: boolean; dir: "asc" | "desc" }>) {
  const className = cn("h-3 w-3 shrink-0", active ? "text-foreground" : "text-muted-foreground");
  if (active) {
    return dir === "asc" ? <CaretUp className={className} /> : <CaretDown className={className} />;
  }
  return <CaretUpDown className={className} />;
}

function isActionsColumn<T>(col: AdminColumn<T>) {
  return col.key === "actions" || col.key === "_actions" || col.label === "";
}

// Extracted from AdminDataTable's row-render JSX: was a nested ternary
// (actionsCol ? ... : col.render ? ... : ...) inline in the TableCell body.
// Named here so the cell's fallback chain (custom render -> raw field ->
// em dash) reads as one sequence of steps instead of adding its own nested
// branch to AdminDataTable's cognitive complexity.
// Fixed row height: a cell's content is clipped to the row height minus the
// cell's py-2, so no cell can make its row taller than --height-table-row.
const ROW_STYLE = { height: "var(--height-table-row)" };
const CELL_CLASS = "py-2";
const CELL_CLIP = "max-h-[calc(var(--height-table-row)_-_1rem)] overflow-hidden";

function renderCellContent<T>(row: T, col: AdminColumn<T>): ReactNode {
  const content = col.render ? col.render(row) : ((readField(row, col.key) as ReactNode) ?? "—");
  if (!isActionsColumn(col)) return <div className={CELL_CLIP}>{content}</div>;
  return <div className="flex items-center justify-center gap-1">{content}</div>;
}

// T is intentionally unconstrained (a plain page-defined interface, not
// Record<string, unknown> — an interface has no index signature, so a
// Record constraint rejects every real column type the pages pass in).
// These two spots read a row by an arbitrary string key (the active sort
// key, or a column with no render()), which only a constrained or indexed
// type allows statically. Both are narrow, intentional escape hatches, not
// a loss of type safety elsewhere: every render() callback below still
// gets the real, fully-typed row.
function readField<T>(row: T, key: string): unknown {
  return (row as unknown as Record<string, unknown>)[key];
}

function compareRows<T>(a: T, b: T, key: string, dir: "asc" | "desc"): number {
  const av = (readField(a, key) as string | number | null | undefined) ?? "";
  const bv = (readField(b, key) as string | number | null | undefined) ?? "";
  if (typeof av === "number" && typeof bv === "number") {
    return dir === "asc" ? av - bv : bv - av;
  }
  const da = Date.parse(String(av));
  const db = Date.parse(String(bv));
  if (!Number.isNaN(da) && !Number.isNaN(db)) {
    return dir === "asc" ? da - db : db - da;
  }
  const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function SortableHeaderCell<T>({
  col,
  sortState,
  onSort,
}: Readonly<{
  col: AdminColumn<T>;
  sortState: typeof sortInitial;
  onSort: (key: string) => void;
}>) {
  const actionsCol = isActionsColumn(col);
  const displayLabel = actionsCol ? "Actions" : col.label;
  const isSortable = !actionsCol && col.sortable !== false;
  const effectiveKey = col.sortKey ?? col.key;
  const isActive = isSortable && sortState.key === effectiveKey;
  const sortDirLabel = sortState.dir === "asc" ? "ascending" : "descending";

  // Extracted from a nested ternary (isSortable ? (isActive ? sortDirLabel
  // : "none") : undefined) inline in aria-sort below, same reasoning as
  // renderCellContent and tableBody above: name the three states (not
  // sortable, sortable but inactive, sortable and active) as one
  // statement instead of a second branch nested inside the first.
  let ariaSortValue: "ascending" | "descending" | "none" | undefined;
  if (!isSortable) {
    ariaSortValue = undefined;
  } else if (isActive) {
    ariaSortValue = sortDirLabel;
  } else {
    ariaSortValue = "none";
  }

  // Extracted from a nested template literal (`Sort by ${displayLabel}${
  // isActive ? `, currently ${sortDirLabel}` : ""}`) inline in aria-label
  // below. Same fix shape as the ternary above: the inactive case is just
  // the column name, the active case appends the current direction, built
  // as one plain string instead of a template literal nested inside
  // another template literal's interpolation.
  const sortAriaLabel = isActive
    ? `Sort by ${displayLabel}, currently ${sortDirLabel}`
    : `Sort by ${displayLabel}`;

  return (
    <TableHead
      key={col.key}
      style={{ width: col.width, height: "var(--height-table-header)" }}
      className={cn(actionsCol && "w-px text-center", col.align === "right" && "text-right")}
      aria-sort={ariaSortValue}
    >
      {isSortable ? (
        <button
          type="button"
          onClick={() => onSort(effectiveKey)}
          aria-label={sortAriaLabel}
          className={cn("inline-flex items-center gap-1", isActive ? "text-foreground" : "text-muted-foreground")}
        >
          {displayLabel}
          <SortIcon active={isActive} dir={sortState.dir} />
        </button>
      ) : (
        <span className={cn("inline-flex items-center", actionsCol && "justify-center w-full")}>{displayLabel}</span>
      )}
    </TableHead>
  );
}

export default function AdminDataTable<T>({
  columns,
  rows,
  loading = false,
  empty = "Records will appear here.",
  emptyIcon = Tray,
  pageSize = 10,
  autoPageSize = false,
  keyField = "id" as keyof T & string,
  onRowClick,
  toolbar,
  className,
  selection,
}: Readonly<AdminDataTableProps<T>>) {
  const [sortState, dispatchSort] = useReducer(sortReducer, sortInitial);
  const [page, setPage] = useReducer((_: number, p: number) => p, 1);
  const [scopeOpen, setScopeOpen] = useState(false);
  const selectedCount = selection?.selectedIds.size ?? 0;
  const navBlocker = useSelectionNavigationGuard(selectedCount > 0);

  const {
    containerRef: apsContainerRef,
    toolbarRef: apsToolbarRef,
    pageSize: effectivePageSize,
  } = useAutoPageSize({
    enabled: autoPageSize,
    pageSize,
    hasToolbar: !!toolbar,
    hasPagination: pageSize > 0,
  });

  // ── Client-side sort ──────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    if (!sortState.key) return rows;
    const key = sortState.key;
    return [...rows].sort((a, b) => compareRows(a, b, key, sortState.dir));
  }, [rows, sortState.key, sortState.dir]);

  function handleSort(key: string) {
    dispatchSort(key);
    setPage(1);
  }

  // ── Pagination ────────────────────────────────────────────────────────
  const totalPages = effectivePageSize > 0 ? Math.max(1, Math.ceil(sortedRows.length / effectivePageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const paginated =
    effectivePageSize > 0
      ? sortedRows.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize)
      : sortedRows;

  const showingTotal = sortedRows.length;
  const showingFrom = showingTotal === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1;
  const showingTo = effectivePageSize > 0 ? Math.min(currentPage * effectivePageSize, showingTotal) : showingTotal;

  const isEmpty = !loading && paginated.length === 0;

  // ── Row selection ─────────────────────────────────────────────────────
  const rowIdOf = (row: T) => String(row[keyField] ?? JSON.stringify(row));
  const canSelect = (row: T) => selection?.isSelectable?.(row) ?? true;
  const selectableIds = paginated.filter(canSelect).map(rowIdOf);
  const selectedOnPage = selection ? selectableIds.filter((id) => selection.selectedIds.has(id)) : [];
  const allSelected = selectableIds.length > 0 && selectedOnPage.length === selectableIds.length;

  // Every selectable row matching the current search and filters, across
  // all table pages (sortedRows is the full filtered list, not one page).
  const selectableAllIds = sortedRows.filter(canSelect).map(rowIdOf);
  const spansPages = selectableAllIds.length > selectableIds.length;
  const allMatchingSelected =
    selection !== undefined &&
    selectableAllIds.length > 0 &&
    selectableAllIds.every((id) => selection.selectedIds.has(id));

  function changeSelection(ids: string[], checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    selection.onChange(next);
  }

  function toggleAllOnPage() {
    if (!selection) return;
    // Ticked already: clear everything the tick could have selected, so
    // after "all rows" one untick clears all of them, not just this page.
    if (allSelected) {
      changeSelection(allMatchingSelected ? selectableAllIds : selectableIds, false);
      return;
    }
    // More than one page of rows: ask what "all" should mean.
    if (spansPages) {
      setScopeOpen(true);
      return;
    }
    changeSelection(selectableIds, true);
  }

  function chooseScope(ids: string[]) {
    changeSelection(ids, true);
    setScopeOpen(false);
  }

  function toggleRow(id: string) {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  }

  function discardAndLeave() {
    // proceed() first: clearing the selection re-renders and would drop the
    // blocker before it could be used.
    navBlocker.proceed?.();
    selection?.onChange(new Set());
  }

  // Extracted from a nested ternary (loading ? ... : !isEmpty ? ... : null)
  // inline in the table body below: three mutually exclusive render states
  // (skeleton rows while loading, real rows once loaded and non-empty,
  // nothing here otherwise — the empty-state message renders separately
  // below the table).
  let tableBody: ReactNode = null;
  if (loading) {
    tableBody = <TableSkeletonRows columns={columns} rowCount={effectivePageSize || 10} withCheckbox={!!selection} />;
  } else if (!isEmpty) {
    tableBody = (
      <TableBody>
        {paginated.map((row) => {
          const rowKey = rowIdOf(row);
          const checked = selection?.selectedIds.has(rowKey) ?? false;
          return (
            <TableRow
              key={rowKey}
              style={ROW_STYLE}
              data-state={checked ? "selected" : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
              {selection && (
                <TableCell className={cn(CELL_CLASS, "w-10 pr-0")} onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={checked}
                    disabled={!canSelect(row)}
                    onChange={() => toggleRow(rowKey)}
                    aria-label="Select row"
                  />
                </TableCell>
              )}
              {columns.map((col) => {
                const actionsCol = isActionsColumn(col);
                return (
                  <TableCell
                    key={col.key}
                    className={cn(
                      CELL_CLASS,
                      actionsCol && "w-px whitespace-nowrap text-center",
                      !actionsCol && col.align === "right" && "text-right"
                    )}
                  >
                    {renderCellContent(row, col)}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", autoPageSize && "flex-1 min-h-0", className)} ref={apsContainerRef}>
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-md border border-border bg-card",
          autoPageSize && "flex-1 min-h-0"
        )}
      >
        {toolbar && (
          <div className="shrink-0 border-b border-border p-2" ref={apsToolbarRef}>
            {toolbar}
          </div>
        )}

        <div className={cn(autoPageSize ? "flex-1 min-h-0 overflow-auto" : "max-h-[70dvh] overflow-auto", isEmpty && "flex flex-col")}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                {selection && (
                  <TableHead className="w-10 pr-0" style={{ height: "var(--height-table-header)" }}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selectedOnPage.length > 0 && !allSelected}
                      disabled={selectableIds.length === 0}
                      onChange={toggleAllOnPage}
                      aria-label="Select all rows on this page"
                    />
                  </TableHead>
                )}
                {columns.map((col) => (
                  <SortableHeaderCell key={col.key} col={col} sortState={sortState} onSort={handleSort} />
                ))}
              </TableRow>
            </TableHeader>

            {tableBody}
          </Table>

          {isEmpty && (
            <div className="flex flex-1 items-center justify-center px-4">
              {typeof empty === "string" ? <EmptyState icon={emptyIcon}>{empty}</EmptyState> : empty}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{showingFrom}–{showingTo}</span> of{" "}
            <span className="font-semibold text-foreground">{showingTotal}</span> records
          </p>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
              aria-label="Previous page"
            >
              <CaretLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 text-sm text-muted-foreground">
              Page <span className="font-semibold text-foreground">{currentPage}</span> of{" "}
              <span className="font-semibold text-foreground">{totalPages}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
              aria-label="Next page"
            >
              <CaretRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {selection && (
        <SelectScopeDialog
          open={scopeOpen}
          shownCount={selectableIds.length}
          totalCount={selectableAllIds.length}
          onSelectShown={() => chooseScope(selectableIds)}
          onSelectAll={() => chooseScope(selectableAllIds)}
          onCancel={() => setScopeOpen(false)}
        />
      )}

      {selection && (
        <DiscardSelectionDialog
          open={navBlocker.state === "blocked"}
          count={selectedCount}
          keepLabel="Stay on this page"
          discardLabel="Discard and leave"
          onKeep={() => navBlocker.reset?.()}
          onDiscard={discardAndLeave}
        />
      )}
    </div>
  );
}

// ── Skeleton rows ──────────────────────────────────────────────────────
// Shaped from the same `columns` array the real rows use, same reasoning
// as amkor-ims's TableSkeletonRows.jsx: a 4-column table and an 8-column
// table each get a skeleton matching their own layout with no per-page
// setup. Uses the existing Skeleton primitive (skeleton.tsx), already the
// established loading treatment elsewhere in this app (discover-list.tsx),
// not a new spinner or text line invented for this component.
const WIDTH_STEPS = [88, 62, 78, 95, 70, 84];

function widthFor(rowIndex: number, colIndex: number) {
  return WIDTH_STEPS[(rowIndex + colIndex) % WIDTH_STEPS.length];
}

function TableSkeletonRows<T>({
  columns,
  rowCount,
  withCheckbox = false,
}: Readonly<{
  columns: AdminColumn<T>[];
  rowCount: number;
  withCheckbox?: boolean;
}>) {
  const rowIndexes = Array.from({ length: Math.max(1, rowCount) }, (_, i) => i);

  return (
    <TableBody>
      {rowIndexes.map((rowIndex) => (
        <TableRow key={rowIndex} style={ROW_STYLE}>
          {withCheckbox && (
            <TableCell className={cn(CELL_CLASS, "w-10 pr-0")}>
              <Skeleton className="h-4 w-4 rounded" />
            </TableCell>
          )}
          {columns.map((col, colIndex) => {
            const actionsCol = isActionsColumn(col);
            return (
              <TableCell key={col.key} className={cn(CELL_CLASS, actionsCol && "w-px text-center")}>
                {actionsCol ? (
                  <div className="flex items-center justify-center gap-1">
                    <Skeleton className="h-6 w-6 rounded-md" />
                    <Skeleton className="h-6 w-6 rounded-md" />
                  </div>
                ) : (
                  <Skeleton
                    className={cn("h-3.5", col.align === "right" && "ml-auto")}
                    style={{ width: `${widthFor(rowIndex, colIndex)}%` }}
                  />
                )}
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </TableBody>
  );
}
