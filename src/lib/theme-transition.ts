import { flushSync } from "react-dom";

// Circular theme reveal: the new theme grows out of the dark mode switch as
// an expanding circle until it covers the whole page. Built on the View
// Transitions API: the browser snapshots the page before and after `update`
// and we animate a clip-path on the "new" snapshot (the default cross-fade
// is switched off in index.css). Browsers without the API, and users who
// prefer reduced motion, just get the instant theme change.
//
// `update` must change the theme synchronously (applyTheme toggles the
// `dark` class right away), so it runs inside flushSync: React state is
// committed before the "after" snapshot is taken.

interface ViewTransitionLike {
  ready: Promise<void>;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

const REVEAL_DURATION_MS = 600;
const REVEAL_EASING = "cubic-bezier(0.65, 0, 0.35, 1)";

export function withThemeTransition(origin: { x: number; y: number }, update: () => void): void {
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!start || reduceMotion) {
    update();
    return;
  }

  const { x, y } = origin;
  const transition = start.call(document, () => {
    flushSync(update);
  });

  transition.ready
    .then(() => {
      // Radius to the farthest viewport corner, so the circle always ends
      // up covering everything wherever the switch sits.
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: REVEAL_DURATION_MS,
          easing: REVEAL_EASING,
          pseudoElement: "::view-transition-new(root)",
        }
      );
    })
    .catch(() => {
      // Transition skipped or interrupted (e.g. toggled again mid-reveal):
      // the theme is already applied, nothing to clean up.
    });
}
