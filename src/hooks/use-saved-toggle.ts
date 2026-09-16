import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";

/**
 * useSavedToggle — the optimistic-toggle logic save-button.tsx and
 * save-route-button.tsx each had their own copy of: check saved state on
 * mount (or reset to false with no session), flip the heart immediately
 * on tap, call the caller's own toggle function, revert and surface an
 * error message on failure, and confirm with a distinct message on
 * success. Extracted once both components' lib layer (saved-places.ts /
 * saved-routes.ts) had nothing left to dedupe, per Step 8's ordering.
 *
 * A signed-out tap opens the auth popup (landing-hero-phases.md 7.3)
 * instead of writing or navigating away, same Disabled/gated reasoning
 * (ux-ui-guidelines.md) both components' own file comments already give:
 * a guest sees the identical heart and a tap prompts sign-in rather than
 * a disabled control with no explanation. This hook owns that popup call
 * so neither component needs its own copy of the check. The map, filters,
 * and open result card all survive since nothing navigates away.
 *
 * itemId is generic (place id or route id), not renamed per-domain,
 * since the hook itself has no opinion on what kind of thing is being
 * saved -- that's entirely encoded in the fetchIsSaved/toggle functions
 * the caller passes in.
 */

interface UseSavedToggleOptions {
  itemId: string;
  fetchIsSaved: (userId: string, itemId: string) => Promise<boolean>;
  toggle: (userId: string, itemId: string, currentlySaved: boolean) => Promise<boolean>;
  /** Shown when an optimistic save fails and reverts. */
  saveErrorMessage: string;
  /** Shown when an optimistic unsave fails and reverts. */
  removeErrorMessage: string;
  /**
   * Fires only after `toggle` resolves, not on the optimistic flip, so a
   * failed toggle that reverts below never fires this. Lets a parent
   * list (e.g. the Saved page) remove its own row the moment an item is
   * unsaved.
   */
  onToggle?: (saved: boolean) => void;
}

export function useSavedToggle({
  itemId,
  fetchIsSaved,
  toggle,
  saveErrorMessage,
  removeErrorMessage,
  onToggle,
}: Readonly<UseSavedToggleOptions>) {
  const { session } = useAuth();
  const { openAuth } = useAuthModal();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  // Without this, a failed toggle just silently reverts the heart with
  // no explanation of why the tap didn't stick.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setSaved(false);
      return;
    }
    fetchIsSaved(session.user.id, itemId)
      .then(setSaved)
      .catch(() => setSaved(false));
    // fetchIsSaved/session are stable identities per render for these
    // callers (module-level exports, auth context), only itemId varies
    // in practice -- matching both original components' own dependency
    // arrays exactly ([session, placeId] / [session, routeId]).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, itemId]);

  function handleClick() {
    if (!session) {
      openAuth("login");
      return;
    }

    setLoading(true);
    setError(null);
    const nextSaved = !saved;
    setSaved((prev) => !prev); // optimistic, reversible personal action
    toggle(session.user.id, itemId, saved)
      .then(() => onToggle?.(nextSaved))
      .catch(() => {
        setSaved((prev) => !prev); // revert on failure
        setError(nextSaved ? saveErrorMessage : removeErrorMessage);
      })
      .finally(() => setLoading(false));
  }

  return { saved, loading, error, handleClick };
}
