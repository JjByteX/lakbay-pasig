/**
 * Motion tokens. One place for the durations, springs and easing the app's
 * motion uses, so a moment in one screen feels like the same moment in
 * another (ux-ui-guidelines.md: repeated values are tokens, never raw
 * numbers scattered through components).
 *
 * The two springs are the ones save-heart.tsx already uses (a press squish
 * and an overshooting pop), so a stop opening and a heart saving read as the
 * same family. EASE_OUT is index.css's --item-focus-ease-out.
 *
 * Pacing, from quickest to slowest:
 *   press    a finger-down response
 *   fast     something leaving
 *   base     most UI changes
 *   slow     content opening or moving
 *   moment   a celebratory beat, never longer
 *
 * Callers check useReducedMotion() themselves and skip the motion (and the
 * haptic) when it is on, as save-heart.tsx does.
 */

export const DURATION = {
  press: 0.1,
  fast: 0.15,
  base: 0.2,
  slow: 0.3,
  moment: 0.6,
} as const;

// A press squish: quick and tight.
export const SPRING_PRESS = { type: "spring", stiffness: 500, damping: 20 } as const;

// A pop that overshoots and settles: something just happened.
export const SPRING_POP = { type: "spring", stiffness: 420, damping: 10 } as const;

// A calm settle with no bounce: content arriving.
export const SPRING_SETTLE = { type: "spring", stiffness: 300, damping: 30 } as const;

export const EASE_OUT: [number, number, number, number] = [0.4, 0, 0.2, 1];

// How long the scan page holds its "Stop unlocked" confirmation before it
// opens the trail. Long enough to read and feel, short enough to never be
// waited on.
export const SCAN_SUCCESS_HOLD_MS = 700;

/**
 * A short haptic tick on devices that support it (Android; iOS Safari has no
 * vibrate API and skips it). Reserved for a real event, never a frequent one.
 */
export function haptic(ms = 10): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
}
