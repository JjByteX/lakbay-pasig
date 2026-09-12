import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { isRouteSaved, toggleSavedRoute } from "@/lib/saved-routes";
import { cn } from "@/lib/utils";

interface SaveRouteButtonProps {
  routeId: string;
  // Step 8, Phase 3.2: mirrors save-button.tsx's own Phase 3.1 addition
  // exactly, same reasoning: optional and additive, trail-detail.tsx's
  // existing call site passes none and is unaffected. The Saved page's
  // Saved Trails section passes this to remove its own row the moment a
  // trail is unsaved. Fires only after toggleSavedRoute resolves, not on
  // the optimistic flip, so a failed unsave that reverts below never
  // fires this.
  onToggle?: (saved: boolean) => void;
}

/**
 * Step 7, Phase 4.7: mirrors save-button.tsx exactly, swapped to
 * saved_routes (saved-routes.ts, Phase 1.6) instead of saved_places, per
 * step-7-phases.md's explicit instruction not to invent a new
 * interaction ("Reuse the existing heart-icon save-button.tsx pattern")
 * and step-7-trail-plan.md's Components section ("Same heart-icon
 * pattern as save-button.tsx, reused for saved_routes instead of a new
 * interaction"). save-button.tsx itself stays place-only (its own file
 * comment: no saved_businesses table exists either, saved_places has a
 * direct place_id foreign key), so this is a sibling component rather
 * than a generalized one, matching how saved-routes.ts already sits
 * beside saved-places.ts as a sibling file rather than a shared one.
 *
 * Same signed-out behavior as save-button.tsx: the heart is visible and
 * tappable for a guest, a signed-out tap navigates to /login instead of
 * writing, never a disabled control, per ux-ui-guidelines.md's
 * Disabled/gated rule and navigation-and-access-control.md's Guest
 * Trail Preview Decision (sign-in gates state changes, not viewing).
 * Also enforced independently at the database layer, saved_routes_own
 * (migration 0007) has no policy allowing an unauthenticated insert.
 */
export function SaveRouteButton({ routeId, onToggle }: SaveRouteButtonProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  // Same reasoning as save-button.tsx's own error state: without this,
  // a failed toggle just silently reverts the heart with no explanation.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setSaved(false);
      return;
    }
    isRouteSaved(session.user.id, routeId)
      .then(setSaved)
      .catch(() => setSaved(false));
  }, [session, routeId]);

  function handleClick() {
    if (!session) {
      navigate("/login");
      return;
    }

    setLoading(true);
    setError(null);
    const nextSaved = !saved;
    setSaved((prev) => !prev); // optimistic, reversible personal action
    toggleSavedRoute(session.user.id, routeId, saved)
      .then(() => onToggle?.(nextSaved))
      .catch(() => {
        setSaved((prev) => !prev); // revert on failure
        setError(
          nextSaved ? "Couldn't save this trail. Try again." : "Couldn't remove this trail. Try again."
        );
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={loading}
        aria-label={saved ? "Remove from saved trails" : "Save this trail"}
        aria-pressed={saved}
      >
        <Heart className={cn("h-5 w-5", saved && "fill-primary text-primary")} />
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
