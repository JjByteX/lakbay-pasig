import { useEffect, useRef, useState } from "react";
import { distanceKm } from "@/lib/geo";
import { formatStepInstruction } from "@/lib/osrm-instructions";
import type { Coordinates } from "@/lib/discover-query";
import type { RouteStep } from "@/lib/directions";

// Voice guidance phase 1, human-asked ("let's make the navigation better" ->
// "no third party needed, go"): speaks each turn-by-turn step
// (osrm-instructions.ts) once, as the person gets close to it, using the
// browser's own Web Speech API (SpeechSynthesisUtterance) -- no network
// call, no npm package, no API key. Every serious open-source nav app this
// was researched against (see the brainstorm earlier in this
// conversation -- miles, firstproject, Roadstr) pairs its OSRM steps with
// this same browser API rather than a paid TTS service, for the same
// reason: it's free, works offline, and needs nothing from the person but
// a device with sound.
//
// `position` comes from the caller (public-shell.tsx's watchPosition),
// same convention use-trail-walk.ts already follows for the same reason:
// one geolocation watch for the whole shell, not a second one started in
// here.

// How close (meters) the person needs to be to a step's maneuver point
// before it's spoken. Google's own driving nav announces a turn 100-300m
// out depending on speed and road type; this app has no speed estimate (no
// live-traffic / speed data, per the earlier brainstorm) and covers
// walking, biking and driving with one number, so 60m was picked as a
// single middle ground: close enough that a walked block (Pasig's own
// streets are short, per the screenshots used earlier this session) still
// gets its own announcement rather than two steps firing back to back, far
// enough that a car moving at typical city speed still has a few seconds'
// warning before the actual turn.
const ANNOUNCE_RADIUS_METERS = 60;

// Re-announce the departure step immediately rather than waiting for a
// position fix to arrive within ANNOUNCE_RADIUS_METERS of it -- "depart"
// has no meaningful "distance until" the way a turn does; the moment a
// route exists, the person is already standing at its start.
function isDepartStep(step: RouteStep): boolean {
  return step.type === "depart";
}

export interface VoiceGuidanceState {
  // Whether speech is currently allowed to speak. Starts true; the mute
  // toggle (navigation UI, next phase) flips this off without losing the
  // hook's own progress through the step list -- muting and un-muting
  // mid-route should not re-announce every step already passed.
  muted: boolean;
  setMuted: (muted: boolean) => void;
  // Whether this browser actually exposes speechSynthesis at all. Every
  // evergreen desktop/mobile browser does, but a caller showing a mute
  // button can use this to hide it entirely rather than show a control
  // that silently does nothing (Safari on some older iOS versions and
  // some embedded WebViews are the known gaps).
  supported: boolean;
}

/**
 * Speaks each step in `steps`, in order, once the person's live `position`
 * comes within ANNOUNCE_RADIUS_METERS of that step's maneuver point
 * (RouteStep.location, directions.ts). Call this once, anywhere a route is
 * actively being followed -- it has no UI of its own; `muted`/`setMuted`
 * from the returned state is what a Cancel/mute button should wire to.
 *
 * Resets its own progress (which step was last announced) whenever `steps`
 * changes identity -- a new fetchRoute call (a reroute, or a fresh
 * Directions session) always returns a new array, so this fires exactly
 * when it should: a new route starts announcing from its own first step,
 * never from wherever the previous route's announcements left off.
 */
export function useVoiceGuidance(
  steps: RouteStep[] | null | undefined,
  position: Coordinates | null,
): VoiceGuidanceState {
  const [muted, setMuted] = useState(false);
  // Browser support is static for the life of the tab, so this is read
  // once via useState's lazy initializer, not re-checked on every render.
  const [supported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
  );

  // Index into `steps` of the next step still owed an announcement. -1
  // means "nothing announced yet for this `steps` array". A ref, not
  // state: advancing it must not itself trigger a re-render (no caller
  // reads "which step" back out of this hook -- directions-panel.tsx's own
  // StepList already shows the full list unconditionally), only the
  // speaking side-effect below needs to run.
  const nextIndexRef = useRef(-1);
  // Identity of the `steps` array last reset against, so the effect below
  // can tell "steps changed, start over" apart from "same steps, position
  // moved" without steps itself being a dependency that would otherwise
  // need an eslint-disable for the comparison it's actually doing.
  const stepsRef = useRef<RouteStep[] | null | undefined>(null);

  useEffect(() => {
    if (!supported) return;
    if (!steps || steps.length === 0) {
      // Route cleared (Cancel) or not loaded yet: nothing to announce,
      // and the next real route -- even one that happens to be the exact
      // same array reference, which can't actually happen since fetchRoute
      // always returns a fresh object, but kept for clarity -- starts
      // counting from its own first step via the reset branch below.
      stepsRef.current = steps;
      nextIndexRef.current = -1;
      return;
    }

    if (stepsRef.current !== steps) {
      // New route: reset progress and announce "depart" immediately,
      // rather than waiting for a position fix near its own location
      // (which is approximately the person's current position anyway, so
      // waiting would mean never, or only once they'd already set off).
      stepsRef.current = steps;
      nextIndexRef.current = 0;
      if (!muted && isDepartStep(steps[0])) {
        window.speechSynthesis.speak(
          new SpeechSynthesisUtterance(formatStepInstruction(steps[0])),
        );
        nextIndexRef.current = 1;
      }
      return;
    }

    if (muted) return;
    if (!position) return;
    const index = nextIndexRef.current;
    if (index < 0 || index >= steps.length) return; // every step already announced

    const step = steps[index];
    const metersAway = distanceKm(position, step.location) * 1000;
    if (metersAway <= ANNOUNCE_RADIUS_METERS) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(formatStepInstruction(step)));
      nextIndexRef.current = index + 1;
    }
    // Deliberately re-runs on every position update (userLocation changes
    // roughly once per watchPosition callback, public-shell.tsx), same
    // "no debounce/throttle" characteristic that file's own ponytail note
    // already calls out for watchPosition itself -- an extra effect run
    // per GPS fix is cheap compared to a missed or duplicated
    // announcement would be.
  }, [steps, position, muted, supported]);

  // Mute stops future announcements, per muted's own doc comment above,
  // but speechSynthesis.speak() calls already queued/speaking before the
  // toggle flips are left to finish naturally rather than cut off --
  // cancel() would stop mid-sentence, which reads as a glitch, not as
  // "muted".

  return { muted, setMuted, supported };
}
