import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * Bulk action toast, shared by every admin list that opts into row
 * selection (AdminDataTable's `selection` prop). It slides up at the bottom
 * centre of the page while at least one row is checked and says what is
 * selected and what can be done with it. Each page passes its own action
 * buttons as children, so Places can offer Verify/Reject while another list
 * offers something else, with one bar look everywhere.
 *
 * It is absolutely positioned, so the page root it sits in must be
 * `relative` (admin list pages already have a bounded flex root). Centring
 * on that root rather than on the screen keeps it centred on the content
 * whatever state the sidebar is in.
 */
export function BulkActionBar({
  count,
  noun = "selected",
  detail,
  onClear,
  children,
}: Readonly<{
  count: number;
  /** Small muted note after the count, e.g. "2 hidden by filters". */
  detail?: string;
  /** Text after the count. Default "selected" gives "3 selected". */
  noun?: string;
  onClear: () => void;
  children: ReactNode;
}>) {
  if (count === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2"
    >
      <span className="px-1 text-sm font-semibold text-foreground">
        {count} {noun}
      </span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      <div className="flex items-center gap-2">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
