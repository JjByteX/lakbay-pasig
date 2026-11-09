import { ArrowUp } from "@phosphor-icons/react";
import type { RouteStep } from "@/lib/directions";

// Turn-by-turn: one icon (ArrowUp), rotated per OSRM modifier, rather than
// importing a separate Phosphor icon per direction. Phosphor's own bend-arrow
// icons (ArrowBendUpLeft etc.) exist but aren't confirmed available at this
// project's pinned @phosphor-icons/react version without checking each name
// individually; a single rotated arrow is the safer, and visually simpler,
// choice -- it's also the same "one glyph, several directions" approach the
// roundabout/turn arrows in Google's own walking-directions panel use.
// "straight"/undefined point up (0deg, ArrowUp's own resting direction),
// "uturn" reuses 180deg since OSRM gives this app no distinct U-turn glyph to
// draw instead.
const MODIFIER_ROTATION: Record<string, number> = {
  uturn: 180,
  "sharp right": 135,
  right: 90,
  "slight right": 45,
  straight: 0,
  "slight left": -45,
  left: -90,
  "sharp left": -135,
};

// "depart"/"notification"/"new name" etc. have no modifier at all (see
// RouteStep in directions.ts); "arrive" gets its own dot, not an arrow, to
// read as "you're done" rather than "continue this way" at a glance.
// Shared by the directions panel's step list and the navigation banner.
//
// prominent: the navigation banner's version, a normal-size arrow in the text
// color with no background tile behind it, so it reads at a glance.
// The step list keeps the small primary-colored icon.
export function stepIcon(step: RouteStep, prominent = false) {
  if (step.type === "arrive") {
    return (
      <span
        className={prominent ? "block h-4 w-4 shrink-0 rounded-full bg-foreground" : "block h-2 w-2 shrink-0 rounded-full bg-primary"}
        aria-hidden="true"
      />
    );
  }
  const rotation = step.modifier ? MODIFIER_ROTATION[step.modifier] ?? 0 : 0;
  return (
    <ArrowUp
      className={prominent ? "h-6 w-6 shrink-0 text-foreground" : "h-4 w-4 shrink-0 text-primary"}
      style={{ transform: `rotate(${rotation}deg)` }}
      aria-hidden="true"
    />
  );
}
