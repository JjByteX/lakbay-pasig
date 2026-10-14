import { Link } from "react-router-dom";
import { ArrowRight, CaretLeft, CaretRight, CheckCircle, X } from "@phosphor-icons/react";
import type { TrailDetail } from "@/lib/trail-types";
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
  // Straight-line meters to the next locked stop, null when there is none or
  // the visitor's position is unknown.
  nextStopMeters: number | null;
  nextStopName: string | null;
  completed: boolean;
  onClose: () => void;
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
  nextStopMeters,
  nextStopName,
  completed,
  onClose,
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
            {nextStopName && nextStopMeters !== null
              ? `Next: ${nextStopName}, ${formatDistance(nextStopMeters)} away`
              : nextStopName
                ? `Next: ${nextStopName}`
                : "Walk to the next stop to open it"}
          </span>
        )}
        <Link to={`/trails/${trail.id}`} className="flex shrink-0 items-center gap-1 font-semibold text-primary">
          Full trail
          <ArrowRight weight="bold" className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
