import { trailMeta } from "./trail-card";
import { SaveRouteButton } from "./save-route-button";
import type { TrailSummary } from "@/lib/trail-types";
import { PRESS_CARD, PRESS_TARGET } from "@/lib/motion";

/**
 * The Saved page's Trails card. Was TrailCard wrapped in a list row beside
 * a heart; now a card of its own for the Saved grid (name, then the same
 * theme / duration / budget line TrailCard shows, via its exported
 * trailMeta). Trails have no photos, so this is a plain card, same border,
 * radius and hover lift as the photo cards beside it in the other tabs.
 * File and export keep their old names (constraints.md: no renames without
 * approval).
 *
 * The tap target and the heart are siblings (a button cannot contain
 * another button). The heart's 8px inset puts its center level with the
 * name's first line. SaveRouteButton's onToggle removes the card the moment
 * the trail is unsaved.
 */
interface SavedTrailRowProps {
  trail: TrailSummary;
  onClick: () => void;
  onUnsave: () => void;
}

export function SavedTrailRow({ trail, onClick, onUnsave }: Readonly<SavedTrailRowProps>) {
  const meta = trailMeta(trail);

  return (
    <div className={`flex h-full items-start rounded-lg border border-border bg-card hover:-translate-y-0.5 ${PRESS_CARD}`}>
      <button
        type="button"
        onClick={onClick}
        className={`${PRESS_TARGET} flex min-w-0 flex-1 flex-col items-start gap-1 rounded-lg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
      >
        <span className="line-clamp-2 text-base font-semibold text-foreground">{trail.name}</span>
        {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
      </button>
      <div className="p-2">
        <SaveRouteButton routeId={trail.id} onToggle={(saved) => !saved && onUnsave()} />
      </div>
    </div>
  );
}
