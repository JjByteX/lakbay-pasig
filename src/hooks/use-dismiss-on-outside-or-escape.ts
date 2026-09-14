import { useEffect, type RefObject } from "react";

/**
 * useDismissOnOutsideOrEscape — the outside-click-or-Escape dismissal
 * effect global-search-bar.tsx and admin-search-bar.tsx each had their
 * own byte-identical copy of: a pointerdown listener that closes the
 * panel when the click lands outside containerRef, plus a keydown
 * listener that closes it on Escape, both attached on mount and torn
 * down on unmount. Extracted here, matching the existing src/hooks/
 * pattern (use-auto-page-size.ts, use-saved-toggle.ts), per Step 8
 * cleanup.
 *
 * This does not merge the two search bars themselves -- admin-search-
 * bar.tsx's own file comment explains why they stay separate (different
 * data sources, an extra Staff group, status badges the public bar has
 * no concept of, different route targets), none of that changes here.
 * Only the dismissal behavior was ever truly identical between them.
 *
 * Takes the container ref and the setter directly rather than returning
 * a ref/open pair of its own, since both callers already own their
 * `open` state (it drives other rendering decisions too, e.g. showPanel)
 * and already own their containerRef (used for the input's wrapping div
 * markup itself) -- this hook only needs to attach listeners against
 * state and a ref that already exist in the caller, not create new ones.
 */
export function useDismissOnOutsideOrEscape(
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void
) {
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // containerRef is a stable ref identity; onDismiss is a plain setState
    // setter (setOpen(false)) at both call sites, also stable -- matching
    // both original effects' own empty dependency arrays exactly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
