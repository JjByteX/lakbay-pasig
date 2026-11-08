import { NavigationArrow, SpeakerHigh, SpeakerX } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatDistance } from "@/lib/directions";
import { formatStepInstruction } from "@/lib/osrm-instructions";
import { useDirections } from "@/components/public/public-shell";
import { ERROR_MESSAGES, TrafficNote, formatDuration } from "./directions-panel";
import { stepIcon } from "./step-icon";

// Navigation view: what replaces the directions panel once Start is pressed.
// A banner under the header with the next turn, and a bar at the bottom with
// the time, distance and arrival left, plus End. Everything it shows comes
// from the shell's trip progress (use-trip-progress.ts), so it moves as the
// person does.
//
// Positioned inside the Discover page's relatively-positioned wrapper, the
// same way the trail panel is, so it sits under the header and above the
// bottom navigation on mobile, and inside the map area on desktop.

const CARD_CLASS = "rounded-2xl border border-input bg-card p-4 shadow";

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function NavigationView() {
  const {
    route,
    directionsPanelResult,
    tripProgress,
    selectedMode,
    modeLoading,
    modeErrorReason,
    voiceMuted,
    setVoiceMuted,
    voiceSupported,
    endNavigation,
    handleCancelDirections,
    following,
    setFollowing,
  } = useDirections();

  if (!route) return null;

  // Arrived: one line and one button. Closing clears the route, which also
  // releases the screen wake lock.
  if (tripProgress?.arrived) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] p-3">
        <div className={`pointer-events-auto mx-auto flex w-full max-w-md items-center justify-between gap-4 ${CARD_CLASS}`}>
          <p className="min-w-0 text-sm font-semibold text-foreground">
            {directionsPanelResult ? `You have arrived at ${directionsPanelResult.name}` : "You have arrived"}
          </p>
          <Button className="min-h-10 shrink-0" onClick={handleCancelDirections}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  const steps = route.legs?.[0]?.steps;
  const step =
    tripProgress && tripProgress.nextStepIndex !== null ? steps?.[tripProgress.nextStepIndex] : undefined;

  let bannerContent;
  if (modeErrorReason) {
    bannerContent = <p className="text-sm text-destructive">{ERROR_MESSAGES[modeErrorReason]}</p>;
  } else if (modeLoading) {
    bannerContent = <p className="text-sm text-muted-foreground">Rerouting…</p>;
  } else if (!tripProgress || !step) {
    bannerContent = <p className="text-sm text-muted-foreground">Waiting for your location…</p>;
  } else {
    bannerContent = (
      <div className="flex items-center gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          {stepIcon(step)}
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">
            {formatDistance(tripProgress.distanceToNextStepMeters ?? 0)}
          </p>
          <p className="text-sm text-foreground">{formatStepInstruction(step)}</p>
        </div>
      </div>
    );
  }

  const arrival = tripProgress
    ? formatClock(new Date(Date.now() + tripProgress.timeRemainingSeconds * 1000))
    : null;

  return (
    <>
      {/* Right padding clears the map's corner controls (locate, legend) that
          sit in the top-right corner. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] py-3 pl-3 pr-16">
        <div className={`pointer-events-auto mx-auto w-full max-w-md ${CARD_CLASS}`}>{bannerContent}</div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] p-3">
        <div className={`pointer-events-auto mx-auto flex w-full max-w-md items-center justify-between gap-4 ${CARD_CLASS}`}>
          <div className="min-w-0">
            {tripProgress ? (
              <>
                <p className="text-base font-semibold text-foreground">
                  {formatDuration(tripProgress.timeRemainingSeconds)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistance(tripProgress.distanceRemainingMeters)} · {arrival}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No position yet</p>
            )}
            <TrafficNote mode={selectedMode} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {voiceSupported && (
              <button
                type="button"
                aria-label={voiceMuted ? "Unmute voice guidance" : "Mute voice guidance"}
                aria-pressed={voiceMuted}
                onClick={() => setVoiceMuted(!voiceMuted)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {voiceMuted ? (
                  <SpeakerX className="h-5 w-5 shrink-0" />
                ) : (
                  <SpeakerHigh className="h-5 w-5 shrink-0" />
                )}
              </button>
            )}
            {!following && (
              <Button variant="outline" className="min-h-10 gap-2" onClick={() => setFollowing(true)}>
                <NavigationArrow className="h-4 w-4 shrink-0" aria-hidden="true" />
                Recenter
              </Button>
            )}
            <Button variant="outline" className="min-h-10" onClick={endNavigation}>
              End
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
