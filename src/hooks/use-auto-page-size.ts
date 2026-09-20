import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useAutoPageSize: measures a table's available height and works out how
 * many rows fit, so a row that doesn't fit moves to the next page instead of
 * forcing the table (or the page) to scroll.
 *
 * Copies amkor-ims's resources/js/hooks/useAutoPageSize.js: row and header
 * heights are CSS var constants (--height-table-row, --height-table-header
 * in index.css), never measured from a rendered row. AdminDataTable forces
 * every row to that height, so the page size depends only on the container,
 * the toolbar, and the constants. An earlier version measured a live row
 * instead, which broke pagination: a new page size changes which row sits
 * first on the page, that row can have a different height, which changes the
 * page size again, and the table flipped between pages forever.
 *
 * The server round trip parts of the original (debounce, the correcting
 * flag, navigation lock, per route remembered size) do not apply, every list
 * here paginates an in-memory array, so a computed size applies at once.
 */

const MIN_ROWS = 3;
const MAX_ROWS = 100;
const FALLBACK_ROW_HEIGHT = 56;
const FALLBACK_HEADER_HEIGHT = 40;
// Pagination bar (h-8 buttons) plus the container's gap-2 above it.
const PAGINATION_BAR_HEIGHT = 40;
// The card's 1px top and bottom border, same 2px Amkor subtracts.
const CARD_BORDER = 2;

function getCssVar(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

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
  // Outer container: the region whose height we measure (admin.tsx's bounded
  // outlet, passed down through the page via flex-1 min-h-0).
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The card's toolbar row, measured live since filters can wrap.
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [computedPageSize, setComputedPageSize] = useState(pageSize);

  const compute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const availableH = container.getBoundingClientRect().height;
    const toolbarH = hasToolbar ? (toolbarRef.current?.getBoundingClientRect().height ?? 0) : 0;
    const rowH = getCssVar("--height-table-row", FALLBACK_ROW_HEIGHT);
    const headerH = getCssVar("--height-table-header", FALLBACK_HEADER_HEIGHT);
    const paginationH = hasPagination ? PAGINATION_BAR_HEIGHT : 0;

    const usable = availableH - toolbarH - headerH - paginationH - CARD_BORDER;
    const rows = Math.floor(usable / rowH);
    setComputedPageSize(Math.max(MIN_ROWS, Math.min(MAX_ROWS, rows)));
  }, [hasToolbar, hasPagination]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(compute);
    observer.observe(container);
    compute();
    return () => observer.disconnect();
  }, [compute, enabled]);

  return {
    containerRef,
    toolbarRef,
    pageSize: enabled ? computedPageSize : pageSize,
  };
}
