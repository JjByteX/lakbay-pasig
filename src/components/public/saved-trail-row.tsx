import { TrailCard } from "./trail-card";
import { SaveRouteButton } from "./save-route-button";
import type { TrailSummary } from "@/lib/trail-types";

/**
 * Step 8, Phase 3.2: Saved page's Saved Trails row. trail-card.tsx's own
 * render is a single full-width `<button>` (Step 7, Phase 2.2), so it
 * cannot also carry the heart control step-8-plan.md requires ("Saved is
 * not read only") nested inside it, a button cannot contain another
 * interactive button. This wrapper places TrailCard and SaveRouteButton
 * as flex siblings, same composition saved-place-row.tsx uses for the
 * identical problem on the Saved Places section, rather than modifying
 * trail-card.tsx itself, which stays unchanged for its existing catalog
 * usage in trails.tsx per constraints.md's Inventory Before Suggesting
 * rule (extend by wrapping, don't reshape a component every other caller
 * already relies on).
 */
interface SavedTrailRowProps {
  trail: TrailSummary;
  onClick: () => void;
  onUnsave: () => void;
}

export function SavedTrailRow({ trail, onClick, onUnsave }: SavedTrailRowProps) {
  return (
    <div className="flex w-full items-center gap-2">
      <div className="min-w-0 flex-1">
        <TrailCard trail={trail} onClick={onClick} />
      </div>
      <div className="pr-4">
        <SaveRouteButton routeId={trail.id} onToggle={(saved) => !saved && onUnsave()} />
      </div>
    </div>
  );
}
