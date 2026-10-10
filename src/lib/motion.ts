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

// Onboarding's own springs (categories-onboarding.tsx), so a screen outside
// onboarding moves like onboarding does. ARRIVE is content landing; STAMP is a
// mark pressed onto the page (the finish check and the sticker).
export const SPRING_ARRIVE = { type: "spring", stiffness: 260, damping: 22 } as const;
export const SPRING_STAMP = { type: "spring", stiffness: 300, damping: 12 } as const;

export const EASE_OUT: [number, number, number, number] = [0.4, 0, 0.2, 1];

// Screen-to-screen travel, the same ease and distance onboarding's Screen uses.
export const EASE_SCREEN: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const SCREEN_SHIFT = 48;

// How long the scan page holds its "Stop unlocked" confirmation before it
// opens the trail. Long enough for the burst and the words to land, short
// enough to never be waited on.
export const SCAN_SUCCESS_HOLD_MS = 1000;

// Touch press feedback. Phones have no hover, so a tap that only changed color
// on hover gave nothing back until the next screen. 100ms is DURATION.press, and
// 0.98 is a squeeze you feel more than see. Tailwind scans this file, so the
// class names below are generated. Reduced motion keeps the color change and
// drops the squeeze.
//
// PRESS goes on the tappable thing itself: a Button, a full-width row.
export const PRESS =
  "transition-[transform,background-color,color,border-color] duration-100 active:scale-[0.98] motion-reduce:active:scale-100";

// PRESS_CARD goes on a card that holds the tap target plus other controls (a
// save heart, a badge). Squeezing the whole card only when a `.press-target`
// inside it is pressed means tapping the heart squishes the heart (its own
// whileTap), not the card around it. Mark each tap target with PRESS_TARGET.
// transition-transform keeps the hover lift the cards already have.
export const PRESS_CARD =
  "transition-transform duration-100 has-[.press-target:active]:scale-[0.98] motion-reduce:has-[.press-target:active]:scale-100";
export const PRESS_TARGET = "press-target";

/**
 * A short haptic tick on devices that support it (Android; iOS Safari has no
 * vibrate API and skips it). Reserved for a real event, never a frequent one.
 */
export function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
}
