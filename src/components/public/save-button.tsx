import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPlaceSaved, toggleSavedPlace } from "@/lib/saved-places";
import { useSavedToggle } from "@/hooks/use-saved-toggle";
import { cn } from "@/lib/utils";

interface SaveButtonProps {
  placeId: string;
  // Step 8, Phase 3.1: optional, additive prop. Existing call sites
  // (discover-place-detail.tsx) pass none and are unaffected. The Saved
  // page's SavedPlaceRow passes this to remove its own row from the list
  // the moment a place is unsaved, since a heart toggle inside this
  // component has no other way to tell a parent list the row's state
  // changed. Fires only on the successful toggle (after toggleSavedPlace
  // resolves), not on the optimistic flip, so a failed unsave that
  // reverts below never fires this and the row correctly stays put.
  onToggle?: (saved: boolean) => void;
}

/**
 * Phase 6.5-6.6 (step-5-phases.md): heart icon, place-only per saved-
 * places.ts's own note (no saved_businesses table exists, matches
 * data-model.md's End User fields). Signed-in tap inserts or deletes the
 * saved_places row directly (6.5), no confirmation modal for a reversible
 * personal action. Guest sees the identical heart icon and tapping it
 * prompts sign-in via navigate("/login") instead of writing (6.6), rather
 * than a disabled button, since ux-ui-guidelines.md's Disabled/gated rule
 * requires a disabled action to clearly communicate what unlocks it, and a
 * bare disabled heart with no explanation would fail that. Also enforced
 * at the database layer independent of this UI check, saved_places has no
 * policy allowing an unauthenticated insert.
 *
 * Heart is one of lucide-react's standard icons for this exact concept
 * (save/favorite), per ux-ui-guidelines.md's icon rules; paired with an
 * aria-label rather than a visible text label since a heart-toggle inside
 * a detail page header is a common enough pattern to read on its own, and
 * a permanent visible "Save" / "Saved" label next to it would compete with
 * the page's own title for attention in a small header row.
 *
 * Step 8 cleanup: the optimistic check-on-mount / flip / revert-with-
 * error logic below is src/hooks/use-saved-toggle.ts's useSavedToggle,
 * shared with save-route-button.tsx rather than kept as two byte-
 * identical copies. This component only supplies the place-specific
 * pieces: placeId as the generic itemId, saved-places.ts's own
 * isPlaceSaved/toggleSavedPlace, and its own error copy.
 */
export function SaveButton({ placeId, onToggle }: Readonly<SaveButtonProps>) {
  const { saved, loading, error, handleClick } = useSavedToggle({
    itemId: placeId,
    fetchIsSaved: isPlaceSaved,
    toggle: toggleSavedPlace,
    saveErrorMessage: "Couldn't save this place. Try again.",
    removeErrorMessage: "Couldn't remove this place. Try again.",
    onToggle,
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={loading}
        aria-label={saved ? "Remove from saved places" : "Save this place"}
        aria-pressed={saved}
      >
        <Heart className={cn("h-5 w-5", saved && "fill-primary text-primary")} />
      </Button>
      {/* Phase 8.3: specific to which direction failed (save vs remove),
          not "something went wrong," per ux-ui-guidelines.md's State
          Rules. text-destructive matches this codebase's one existing
          error-message convention rather than a new color invented here. */}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
