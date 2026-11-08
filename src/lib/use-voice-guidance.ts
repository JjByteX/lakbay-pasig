import { useEffect, useRef, useState } from "react";
import { formatStepInstruction } from "@/lib/osrm-instructions";
import type { RouteStep, TravelMode } from "@/lib/directions";
import type { TripProgress } from "@/lib/use-trip-progress";

// Voice guidance: speaks each turn-by-turn step (osrm-instructions.ts) once,
// as the person gets close to it, using the browser's own Web Speech API
// (SpeechSynthesisUtterance) -- no network call, no npm package, no API key.
//
// It speaks only while navigating (after Start). A route that is only being
// previewed is silent. Which step is next, and how far away it is, comes from
// useTripProgress, so the banner and the voice always agree.

// How close (meters) the person needs to be to the next maneuver before it is
// spoken, per mode. Slower travel needs a shorter lead: a walked block still
// gets its own announcement, and a car still has a few seconds of warning.
const ANNOUNCE_RADIUS_METERS: Record<TravelMode, number> = {
  foot: 25,
  bike: 60,
  car: 150,
};

function isDepartStep(step: RouteStep): boolean {
  return step.type === "depart";
}

export interface VoiceGuidanceState {
  // True while speech is silenced. Starts false; the mute toggle flips it
  // without losing the hook's progress through the step list, so muting and
  // un-muting mid-route does not re-announce every step already passed.
  muted: boolean;
  setMuted: (muted: boolean) => void;
  // Whether this browser exposes speechSynthesis at all, so a caller showing
  // a mute button can hide it rather than show a control that does nothing.
  supported: boolean;
}

/**
 * Speaks the steps in `steps`, in order, while `navigating`. The departure
 * line is spoken once, when navigation starts. After that each step is spoken
 * once, when `progress` says it is the next step and it is within the mode's
 * announce distance.
 *
 * A new `steps` array while navigating (a reroute, or a different alternative
 * picked) restarts the step counter without speaking the departure line
 * again: the trip is the same trip, only the route under it changed.
 */
export function useVoiceGuidance(
  steps: RouteStep[] | null | undefined,
  progress: TripProgress | null,
  navigating: boolean,
  mode: TravelMode,
): VoiceGuidanceState {
  const [muted, setMuted] = useState(false);
  const [supported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
  );

  // Index of the last step already owed no further announcement. 0 means only
  // the departure step is behind us. A ref: advancing it must not re-render.
  const lastAnnouncedRef = useRef(-1);
  // The `steps` array last seen while navigating, to tell a new route from a
  // new position on the same route.
  const stepsRef = useRef<RouteStep[] | null | undefined>(null);
  const wasNavigatingRef = useRef(false);

  const nextStepIndex = progress?.nextStepIndex ?? null;
  const distanceToNextStepMeters = progress?.distanceToNextStepMeters ?? null;

  useEffect(() => {
    if (!supported) return;

    if (!navigating || !steps || steps.length === 0) {
      wasNavigatingRef.current = false;
      stepsRef.current = steps;
      lastAnnouncedRef.current = -1;
      return;
    }

    if (!wasNavigatingRef.current) {
      // Start: speak the departure line once.
      wasNavigatingRef.current = true;
      stepsRef.current = steps;
      lastAnnouncedRef.current = 0;
      if (!muted && isDepartStep(steps[0])) {
        window.speechSynthesis.speak(
          new SpeechSynthesisUtterance(formatStepInstruction(steps[0])),
        );
      }
      return;
    }

    if (stepsRef.current !== steps) {
      // Reroute or alternative swap: same trip, new steps. No departure line.
      stepsRef.current = steps;
      lastAnnouncedRef.current = 0;
      return;
    }

    if (muted) return;
    if (nextStepIndex === null || distanceToNextStepMeters === null) return;
    if (nextStepIndex <= lastAnnouncedRef.current) return; // already spoken
    if (distanceToNextStepMeters > ANNOUNCE_RADIUS_METERS[mode]) return;

    window.speechSynthesis.speak(
      new SpeechSynthesisUtterance(formatStepInstruction(steps[nextStepIndex])),
    );
    lastAnnouncedRef.current = nextStepIndex;
  }, [steps, navigating, muted, supported, mode, nextStepIndex, distanceToNextStepMeters]);

  // Mute stops future announcements; speech already queued is left to finish
  // rather than cut off mid-sentence, which would read as a glitch.

  return { muted, setMuted, supported };
}
