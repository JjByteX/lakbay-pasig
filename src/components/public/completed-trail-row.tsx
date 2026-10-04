import { Badge } from "@/components/ui/badge";
import { trailMeta } from "./trail-card";
import type { TrailSummary } from "@/lib/trail-types";

/**
 * The Saved page's Completed card. Was a TrailCard row with a date and
 * credential line under it; now one card in the Saved grid: name, the
 * theme / duration / budget line, the completed date, and when a credential
 * exists an "Earned: {name}" badge. File and export keep their old names
 * (constraints.md: no renames without approval).
 *
 * "Earned: {name}" wording and Badge variant="accent" are copied from
 * trail-detail.tsx's completed-state badge. Every trail reaching this
 * component is already completed (fetchCompletedRoutes), so there is no
 * "Earn" (aspirational) branch. No heart: Completed is a completion log,
 * not a saved list, so there is no onUnsave. One credential per completed
 * trail, shown here, not in a second list.
 *
 * Badge sits outside the tap target (it is a div, and a button may hold
 * only phrasing content), under it inside the same card.
 */
function formatCompletedDate(iso: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface CompletedTrailRowProps {
  trail: TrailSummary & { completed_at: string };
  onClick: () => void;
}

export function CompletedTrailRow({ trail, onClick }: Readonly<CompletedTrailRowProps>) {
  const formattedDate = formatCompletedDate(trail.completed_at);
  const meta = trailMeta(trail);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card transition-transform hover:-translate-y-0.5">
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 flex-col items-start gap-1 rounded-lg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="line-clamp-2 text-base font-semibold text-foreground">{trail.name}</span>
        {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
        {formattedDate && <span className="text-sm text-muted-foreground">Completed {formattedDate}</span>}
      </button>
      {trail.credentialName && (
        <div className="px-4 pb-4">
          <Badge variant="accent" className="w-fit max-w-full break-words">
            Earned: {trail.credentialName}
          </Badge>
        </div>
      )}
    </div>
  );
}
