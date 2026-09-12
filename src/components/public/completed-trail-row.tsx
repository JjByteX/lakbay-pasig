import { Badge } from "@/components/ui/badge";
import { TrailCard } from "./trail-card";
import type { TrailSummary } from "@/lib/trail-types";

/**
 * Step 8, Phase 3.4: Saved page's Completed Trails row. Small wrapper
 * around trail-card.tsx, not a copy of it, per step-8-plan.md's own
 * instruction ("Needs a small wrapper around TrailCard, not the bare
 * card"). Renders the base TrailCard row unchanged, then adds a completed
 * date and, when a credential exists, an inline "Earned: {name}" line
 * beneath it -- two facts TrailCard has no reason to render for its other
 * caller (trails.tsx's catalog, which has no per-user completion data at
 * all).
 *
 * "Earned: {name}" wording and treatment (Badge variant="accent") copied
 * exactly from trail-detail.tsx's own completed-state badge
 * (`{completed ? "Earned" : "Earn"}: {trail.credential.credential_name}`),
 * per step-8-plan.md's "exact wording trail-detail.tsx already uses."
 * Every route reaching this component is already completed (it only ever
 * renders from fetchCompletedRoutes's result), so there is no "Earn"
 * (aspirational) branch here, only "Earned".
 *
 * No heart control on this row: Completed Trails is a completion log,
 * not a saved-item list (step-8-plan.md scopes the heart/unsave control
 * to Saved Places and Saved Trails only), so no onUnsave prop exists here
 * unlike saved-place-row.tsx and saved-trail-row.tsx.
 *
 * One credential per completed route, no separate credentials section,
 * per step-8-plan.md and ux-ui-guidelines.md's card fragmentation rule --
 * this line is where a credential shows up, not a second list repeating
 * the same route.
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

export function CompletedTrailRow({ trail, onClick }: CompletedTrailRowProps) {
  const formattedDate = formatCompletedDate(trail.completed_at);

  return (
    <div className="flex w-full flex-col gap-1">
      <TrailCard trail={trail} onClick={onClick} />
      <div className="flex flex-wrap items-center gap-2 px-6 pb-4 -mt-2">
        {formattedDate && (
          <span className="text-sm text-muted-foreground">Completed {formattedDate}</span>
        )}
        {trail.credentialName && (
          <Badge variant="accent" className="w-fit max-w-full break-words">
            Earned: {trail.credentialName}
          </Badge>
        )}
      </div>
    </div>
  );
}
