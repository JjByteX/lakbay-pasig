import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useAutoPageSize — measures a table's available height and works out how
 * many rows actually fit, so a row that doesn't fit moves to the next page
 * instead of forcing the table (or the page) to scroll.
 *
 * Ported from amkor-ims's resources/js/hooks/useAutoPageSize.js. That
 * original measures against fixed CSS-var row/header heights (every amkor
 * table row is a constant 52px, single-line text) and round-trips the
 * computed size through a Laravel server paginator (debounce, a
 * `correcting` flag while waiting on the server to confirm, a nav-lock
 * during page clicks so the ResizeObserver doesn't fight an in-flight
 * page change, and a per-route remembered size in localStorage to seed the
 * server's first response).
 *
 * None of that server round-trip applies here: every admin list in this
 * app fetches its full row set from Supabase on mount and paginates a
 * plain in-memory array (admin-data-table.tsx's own file comment, and
 * every admin-*.tsx page it backs — confirmed by inventory before writing
 * this, constraints.md's Inventory Before Suggesting rule). A computed
 * page size takes effect immediately, there is nothing to "confirm" from a
 * server, so `correcting`, `lockNavigation`, and tablePageSize.js's
 * localStorage remembering (whose whole reason to exist is seeding a
 * server's first response before the client can measure) are dropped
 * entirely rather than ported as dead code, per ponytail's YAGNI rung.
 *
 * The one genuine adaptation, not an arbitrary simplification: this app's
 * rows are variable height (badges, occasionally-wrapping business/place/
 * event text), not amkor's constant 52px. So this hook measures one real
 * rendered row's height directly (via rowRef) instead of assuming a
 * constant — everything else (measure on resize, subtract header/toolbar/
 * pagination-bar height, divide, clamp, debounce) is the same shape as the
 * original.
 */

const DEBOUNCE_MS = 150;
const MIN_ROWS = 3;
const MAX_ROWS = 100;
const FALLBACK_ROW_HEIGHT = 44;
const PAGINATION_BAR_HEIGHT = 40;

interface UseAutoPageSizeOptions {
  /** Enable the hook. When false, returns the static `pageSize` unchanged. */
  enabled: boolean;
  /** Fallback / initial page size, used before the first measurement and when disabled. */
  pageSize: number;
  /** Whether a toolbar is rendered above the table (search row, filters). */
  hasToolbar: boolean;
  /** Whether a pagination bar is rendered below the table. */
  hasPagination: boolean;
}

export function useAutoPageSize({
  enabled,
  pageSize,
  hasToolbar,
  hasPagination,
}: UseAutoPageSizeOptions) {
  // Outer container: the region whose available height we measure against
  // (admin.tsx's bounded outlet, propagated down through the page and into
  // this table via flex-1 min-h-0 on every ancestor in the chain).
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The card's toolbar row, measured live (no CSS var to read here).
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  // The table header row, measured live for the same reason.
  const headerRef = useRef<HTMLTableSectionElement | null>(null);
  // One real rendered body row, measured directly since row height is
  // variable in this app (see file comment above).
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  const [computedPageSize, setComputedPageSize] = useState(pageSize);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastComputed = useRef(pageSize);

  const compute = useCallback(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const availableH = container.getBoundingClientRect().height;
    const toolbarH = hasToolbar ? (toolbarRef.current?.getBoundingClientRect().height ?? 0) : 0;
    const headerH = headerRef.current?.getBoundingClientRect().height ?? FALLBACK_ROW_HEIGHT;
    const rowH = rowRef.current?.getBoundingClientRect().height ?? FALLBACK_ROW_HEIGHT;
    const paginationH = hasPagination ? PAGINATION_BAR_HEIGHT : 0;

    const usable = availableH - toolbarH - headerH - paginationH;
    const rows = Math.floor(usable / rowH);
    const clamped = Math.max(MIN_ROWS, Math.min(MAX_ROWS, rows));

    if (clamped === lastComputed.current) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      lastComputed.current = clamped;
      setComputedPageSize(clamped);
    }, DEBOUNCE_MS);
  }, [enabled, hasToolbar, hasPagination]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(compute);
    observer.observe(container);
    compute();

    return () => {
      observer.disconnect();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compute, enabled]);

  // Row height can change independently of the container (a badge wraps
  // once real data loads, or the loading skeleton row swaps for a real
  // row) — the effect above only observes the container, so this second
  // observer specifically tracks whichever DOM node rowRef currently
  // points at and re-attaches whenever that node changes (loading flips,
  // rows swap in). A callback ref, not useEffect keyed on rowRef.current,
  // since a plain ref object's `.current` mutating does not itself
  // re-trigger a dependency array.
  const rowObserver = useRef<ResizeObserver | null>(null);
  const observedRowNode = useRef<HTMLTableRowElement | null>(null);
  const setRowRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      rowRef.current = node;
      if (!enabled) return;
      if (observedRowNode.current) {
        rowObserver.current?.disconnect();
      }
      observedRowNode.current = node;
      if (node) {
        rowObserver.current = new ResizeObserver(compute);
        rowObserver.current.observe(node);
      }
      compute();
    },
    [enabled, compute]
  );

  useEffect(() => {
    return () => rowObserver.current?.disconnect();
  }, []);

  return {
    containerRef,
    toolbarRef,
    headerRef,
    rowRef: setRowRef,
    pageSize: enabled ? computedPageSize : pageSize,
  };
}
