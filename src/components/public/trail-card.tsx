import type { TrailSummary } from "@/lib/trail-types";
import { cn } from "@/lib/utils";

/**
 * Step 7, Phase 2.2: catalog row, name/theme/duration, same row-button
 * list shape verified-item-card.tsx and announcement-card.tsx already
 * establish (`<li><button>...</button></li>` from the parent list, plain
 * button here, no card wrapper per row) per ux-ui-guidelines.md's
 * Component Sizing Rules (no card grid for a list this shape) and
 * step-7-trail-plan.md's Trail catalog page section, reused rather than
 * reinvented per constraints.md's Inventory Before Suggesting rule.
 *
 * Fields shown: name, theme, duration, budget, matching step-7-trail-
 * plan.md's Trail catalog page line verbatim ("Name, theme, duration,
 * budget.") and step-7-phases.md 2.2's "name/theme/duration" row shape,
 * theme/duration/budget joined on one secondary line rather than three
 * separate lines, keeping this row the same two-line shape as its
 * sibling rows in this list (verified-item-card.tsx, announcement-
 * card.tsx: name line, one metadata line). All four fields already sit
 * on TrailSummary (Phase 1.1/1.2), no extra query needed to show budget.
 */
interface TrailCardProps {
  trail: TrailSummary;
  onClick: () => void;
  // One line at md+ (name left, meta right). Opt-in: the Trails catalog
  // passes it; stacked below md.
  inline?: boolean;
  // Replaces the theme, duration and budget line. A personal trail has none of
  // those, so the Trails tab shows its stop count here instead.
  meta?: string;
}

// Theme, duration and budget on one line. Shared with the Saved page's trail
// cards (saved-trail-row.tsx, completed-trail-row.tsx), which no longer wrap
// TrailCard but show the same line.
export function trailMeta(trail: TrailSummary): string {
  return [trail.theme, trail.estimated_duration, trail.estimated_budget].filter(Boolean).join(" · ");
}

export function TrailCard({ trail, onClick, inline = false, meta: metaOverride }: Readonly<TrailCardProps>) {
  const meta = metaOverride ?? trailMeta(trail);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-start gap-1 px-6 py-4 text-left transition-colors hover:bg-muted",
        inline && "md:flex-row md:items-center md:justify-between md:gap-6",
      )}
    >
      <span className={cn("text-base font-semibold text-foreground", inline && "md:min-w-0 md:truncate")}>
        {trail.name}
      </span>
      {meta && <span className={cn("text-sm text-muted-foreground", inline && "md:shrink-0")}>{meta}</span>}
    </button>
  );
}
