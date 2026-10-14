import { Link } from "react-router-dom";
import { ArrowBendUpRight, ArrowRight, CaretLeft, CaretRight, CheckCircle, X } from "@phosphor-icons/react";
import type { TrailDetail, TrailStop as TrailStopData } from "@/lib/trail-types";
import { Button } from "@/components/ui/button";
import { TrailStop, type TrailStopState } from "./trail-stop";

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface DiscoverTrailPanelProps {
  trail: TrailDetail;
  stopStates: TrailStopState[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  unlockedEntryIds: Set<string>;
  progressLive: boolean;
  // The next locked stop in sequence (discover.tsx's own `nextStop`), null
  // once the trail is complete or there is no saved progress yet. Carries
  // the stop's coordinates, not just its name/distance, so this panel can
  // hand it to Directions (trailStopAsDiscoverResult) -- not only display it.
  nextStop: TrailStopData | null;
  // Straight-line meters to nextStop, null when there is none or the
  // visitor's position is unknown.
  nextStopMeters: number | null;
  // True while the visitor is still on their way to stop 1 (it is open but
  // they are not there yet): `nextStop` is then stop 1 and the wording says
  // "Head to" instead of "Next".
  headingToStart?: boolean;
  completed: boolean;
  onClose: () => void;
  // Starts a Directions session to nextStop (public-shell.tsx's
  // handleRouteFound, same path PageDirectionsButton uses for a place).
  // Omitted/no-op when there is no origin to route from (location off) --
  // PageDirectionsButton hides its whole button in that case; this one
  // stays visible (it sits in a footer already showing trail state, an
  // appearing/disappearing button there would be more surprising than a
  // button that explains itself on tap) and the handler below shows an
  // inline reason instead.
  onGetDirections: (stop: TrailStopData) => void;
  directionsLoading: boolean;
  directionsError: string | null;
}

/**
 * What the Discover map shows under a trail: the selected stop's information
 * and a way to step through the stops. The stop itself is trail-stop.tsx, the
 * same component the trail page renders, so a locked stop shows its name only
 * (no spoilers), an unlocked one shows its discovery content, and a stop that
 * needs a QR scan still asks for the scan. Nothing about unlocking is decided
 * here.
 */
export function DiscoverTrailPanel({
  trail,
  stopStates,
  selectedIndex,
  onSelectIndex,
  unlockedEntryIds,
  progressLive,
  nextStop,
  nextStopMeters,
  headingToStart = false,
  completed,
  onClose,
  onGetDirections,
  directionsLoading,
  directionsError,
}: Readonly<DiscoverTrailPanelProps>) {
  const stop = trail.stops[selectedIndex];
  const total = trail.stops.length;
  if (!stop) return null;

  return (
    <div className="pointer-events-auto mx-auto flex max-h-[45vh] w-full max-w-md flex-col rounded-2xl border border-input bg-card shadow">
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{trail.name}</span>
          <span className="text-xs text-muted-foreground">
            Stop {selectedIndex + 1} of {total}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous stop"
          disabled={selectedIndex === 0}
          onClick={() => onSelectIndex(selectedIndex - 1)}
        >
          <CaretLeft weight="bold" className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next stop"
          disabled={selectedIndex === total - 1}
          onClick={() => onSelectIndex(selectedIndex + 1)}
        >
          <CaretRight weight="bold" className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Close trail" onClick={onClose}>
          <X weight="bold" className="h-4 w-4" />
        </Button>
      </div>

      <ul className="overflow-y-auto px-3">
        <TrailStop
          key={stop.id}
          stop={stop}
          index={selectedIndex}
          state={stopStates[selectedIndex]}
          unlockedEntryIds={unlockedEntryIds}
          progressLive={progressLive}
          variant="plain"
        />
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {completed ? (
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <CheckCircle weight="fill" className="h-4 w-4 text-primary" aria-hidden="true" />
            Trail complete
          </span>
        ) : (
          <span className="min-w-0 truncate">
            {nextStop && nextStopMeters !== null
              ? `${headingToStart ? "Head to" : "Next:"} ${nextStop.name}, ${formatDistance(nextStopMeters)} away`
              : nextStop
                ? `${headingToStart ? "Head to" : "Next:"} ${nextStop.name}`
                : "Walk to the next stop to open it"}
          </span>
        )}
        <Link to={`/trails/${trail.id}`} className="flex shrink-0 items-center gap-1 font-semibold text-primary">
          Full trail
          <ArrowRight weight="bold" className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Directions to the next stop, same fetchRoute/DirectionsPanel path a
          place or business's own page uses (page-directions-button.tsx),
          via trailStopAsDiscoverResult. Only while there is a next stop to
          walk to -- a completed trail or one with no saved progress yet has
          nothing to route to (Start, not Resume, is the right action then,
          and that button already lives on the trail page itself). */}
      {!completed && nextStop && (
        <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
          {directionsError && <p className="text-xs text-destructive">{directionsError}</p>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-2"
            disabled={directionsLoading}
            loading={directionsLoading}
            onClick={() => onGetDirections(nextStop)}
          >
            {directionsLoading ? "Getting directions…" : `Directions to ${nextStop.name}`}
            {!directionsLoading && <ArrowBendUpRight weight="bold" className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      )}
    </div>
  );
}
