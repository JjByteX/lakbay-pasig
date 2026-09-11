import { useMemo, useReducer, type ReactNode, type Ref } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
 * against — every other admin route (dashboard, detail pages, the trail
 * builder) keeps the plain scrolling outlet, since those pages have no
 * table to fit and rely on normal page scroll. Each of the five list
 * pages' own root div also needs flex-1 min-h-0 (not the default block
 * flow) so that bounded height actually reaches this component instead of
 * stopping at the page's own wrapper — see each admin-*.tsx page.
 *
 * Two differences from the original, both required by this app's own
 * column shapes, not arbitrary simplifications:
 *   - amkor's rows are a fixed 52px (--height-table-row) because every
 *     cell there is single-line text. This table's rows hold badges and
 *     occasionally-wrapping text (business/place/event columns), so row
 *     height is genuinely variable — use-auto-page-size.ts measures one
 *     real rendered row's height directly instead of assuming a constant.
 *   - No server round trip exists to correct against (amkor's hook exists
 *     partly to reconcile a server-paginated response with the client's
 *     own measurement, hence its debounce/correcting/navLock machinery).
 *     Every list here is already a full client-side array, so the
 *     computed page size is applied directly, no correction window,
 *     no per-route remembered size (tablePageSize.js's whole reason to
 *     exist — seeding a server's first response — doesn't apply here).
 *
 * Opt-in via the `autoPageSize` prop, matching amkor's own prop name.
 * When false (the default), `pageSize` behaves exactly as before: a fixed
 * page size, table capped at a max height and scrolling internally. The
 * five admin-*.tsx list pages pass autoPageSize; any future table that
 * wants a fixed page size instead (e.g. an embedded table inside a detail
 * page, with no bounded outlet to measure against) can still opt out.
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

interface AdminDataTableProps<T> {
  columns: AdminColumn<T>[];
  rows: T[];
  /** Explicit loading flag — pages already track this via `rows === null`. */
  loading?: boolean;
  empty?: ReactNode;
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

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  const className = cn("h-3 w-3 shrink-0", active ? "text-foreground" : "text-muted-foreground");
  if (active) {
    return dir === "asc" ? <ChevronUp className={className} /> : <ChevronDown className={className} />;
  }
  return <ChevronsUpDown className={className} />;
}

function isActionsColumn<T>(col: AdminColumn<T>) {
  return col.key === "actions" || col.key === "_actions" || col.label === "";
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

export default function AdminDataTable<T>({
  columns,
  rows,
  loading = false,
  empty = "No records found.",
  pageSize = 10,
  autoPageSize = false,
  keyField = "id" as keyof T & string,
  onRowClick,
  toolbar,
  className,
}: AdminDataTableProps<T>) {
  const [sortState, dispatchSort] = useReducer(sortReducer, sortInitial);
  const [page, setPage] = useReducer((_: number, p: number) => p, 1);

  const {
    containerRef: apsContainerRef,
    toolbarRef: apsToolbarRef,
    headerRef: apsHeaderRef,
    rowRef: apsRowRef,
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
    return [...rows].sort((a, b) => {
      const av = (readField(a, key) as string | number | null | undefined) ?? "";
      const bv = (readField(b, key) as string | number | null | undefined) ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortState.dir === "asc" ? av - bv : bv - av;
      }
      const da = Date.parse(String(av));
      const db = Date.parse(String(bv));
      if (!isNaN(da) && !isNaN(db)) {
        return sortState.dir === "asc" ? da - db : db - da;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return sortState.dir === "asc" ? cmp : -cmp;
    });
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

        <div className={cn(autoPageSize ? "flex-1 min-h-0 overflow-auto" : "max-h-[70dvh] overflow-auto")}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card" ref={apsHeaderRef}>
              <TableRow>
                {columns.map((col) => {
                  const actionsCol = isActionsColumn(col);
                  const displayLabel = actionsCol ? "Actions" : col.label;
                  const isSortable = !actionsCol && col.sortable !== false;
                  const effectiveKey = col.sortKey ?? col.key;
                  const isActive = isSortable && sortState.key === effectiveKey;

                  return (
                    <TableHead
                      key={col.key}
                      style={{ width: col.width }}
                      className={cn(actionsCol && "w-px text-center", col.align === "right" && "text-right")}
                      aria-sort={
                        isSortable ? (isActive ? (sortState.dir === "asc" ? "ascending" : "descending") : "none") : undefined
                      }
                    >
                      {isSortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(effectiveKey)}
                          aria-label={`Sort by ${displayLabel}${isActive ? `, currently ${sortState.dir === "asc" ? "ascending" : "descending"}` : ""}`}
                          className={cn(
                            "inline-flex items-center gap-1",
                            isActive ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          {displayLabel}
                          <SortIcon active={isActive} dir={sortState.dir} />
                        </button>
                      ) : (
                        <span className={cn("inline-flex items-center", actionsCol && "justify-center w-full")}>
                          {displayLabel}
                        </span>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            {loading ? (
              <TableSkeletonRows columns={columns} rowCount={effectivePageSize || 10} rowRef={apsRowRef} />
            ) : !isEmpty ? (
              <TableBody>
                {paginated.map((row, rowIndex) => {
                  const rowKey = String(row[keyField] ?? JSON.stringify(row));
                  return (
                    <TableRow
                      key={rowKey}
                      ref={rowIndex === 0 ? apsRowRef : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={onRowClick ? "cursor-pointer" : undefined}
                    >
                      {columns.map((col) => {
                        const actionsCol = isActionsColumn(col);
                        return (
                          <TableCell
                            key={col.key}
                            className={cn(
                              actionsCol && "w-px whitespace-nowrap text-center",
                              !actionsCol && col.align === "right" && "text-right"
                            )}
                          >
                            {actionsCol ? (
                              <div className="flex items-center justify-center gap-1">
                                {col.render ? col.render(row) : (readField(row, col.key) as ReactNode) ?? "—"}
                              </div>
                            ) : col.render ? (
                              col.render(row)
                            ) : (
                              ((readField(row, col.key) as ReactNode) ?? "—")
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            ) : null}
          </Table>

          {isEmpty && (
            <div className="flex items-center justify-center px-4 py-10 text-center">
              {typeof empty === "string" ? (
                <p className="text-sm text-muted-foreground">{empty}</p>
              ) : (
                empty
              )}
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
              <ChevronLeft className="h-4 w-4" />
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
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
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
  rowRef,
}: {
  columns: AdminColumn<T>[];
  rowCount: number;
  rowRef?: Ref<HTMLTableRowElement>;
}) {
  const rowIndexes = Array.from({ length: Math.max(1, rowCount) }, (_, i) => i);

  return (
    <TableBody>
      {rowIndexes.map((rowIndex) => (
        <TableRow key={rowIndex} ref={rowIndex === 0 ? rowRef : undefined}>
          {columns.map((col, colIndex) => {
            const actionsCol = isActionsColumn(col);
            return (
              <TableCell key={col.key} className={cn(actionsCol && "w-px text-center")}>
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
