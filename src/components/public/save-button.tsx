import { Heart } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { isPlaceSaved, toggleSavedPlace } from "@/lib/saved-places";
import { isBusinessSaved, toggleSavedBusiness } from "@/lib/saved-businesses";
import { useSavedToggle } from "@/hooks/use-saved-toggle";
import { cn } from "@/lib/utils";

// What the heart saves. Each kind has its own table (saved_places 0007,
// saved_businesses 0047) and its own lib functions and error copy, picked once
// below. The optimistic toggle itself is use-saved-toggle.ts, shared.
const KINDS = {
  place: {
    fetchIsSaved: isPlaceSaved,
    toggle: toggleSavedPlace,
    saveErrorMessage: "Couldn't save this place. Try again.",
    removeErrorMessage: "Couldn't remove this place. Try again.",
    saveLabel: "Save this place",
    removeLabel: "Remove from saved places",
  },
  business: {
    fetchIsSaved: isBusinessSaved,
    toggle: toggleSavedBusiness,
    saveErrorMessage: "Couldn't save this business. Try again.",
    removeErrorMessage: "Couldn't remove this business. Try again.",
    saveLabel: "Save this business",
    removeLabel: "Remove from saved businesses",
  },
} as const;

interface SaveButtonProps {
  // Defaults to "place", so a caller that saves a place passes only itemId.
  kind?: keyof typeof KINDS;
  // The place id or the business id, whichever kind says.
  itemId: string;
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
 * Phase 6.5-6.6 (step-5-phases.md): heart icon. It was place-only until
 * migration 0047 added saved_businesses (decision-log.md entry #41), so it
 * now takes a kind. Signed-in tap inserts or deletes the saved_places or
 * saved_businesses row directly (6.5), no confirmation modal for a reversible
 * personal action. Guest sees the identical heart icon and tapping it
 * opens the auth popup via openAuth("login") instead of writing
 * (landing-hero-phases.md 7.4, previously navigate("/login") in 6.6),
 * rather than a disabled button, since ux-ui-guidelines.md's Disabled/gated rule
 * requires a disabled action to clearly communicate what unlocks it, and a
 * bare disabled heart with no explanation would fail that. Also enforced
 * at the database layer independent of this UI check, neither table has a
 * policy allowing an unauthenticated insert.
 *
 * Heart is one of Phosphor's standard icons for this exact concept
 * (save/favorite), per ux-ui-guidelines.md's icon rules; paired with an
 * aria-label rather than a visible text label since a heart-toggle inside
 * a detail page header is a common enough pattern to read on its own, and
 * a permanent visible "Save" / "Saved" label next to it would compete with
 * the page's own title for attention in a small header row.
 *
 * Step 8 cleanup: the optimistic check-on-mount / flip / revert-with-
 * error logic below is src/hooks/use-saved-toggle.ts's useSavedToggle,
 * shared with save-route-button.tsx rather than kept as two byte-
 * identical copies. This component only supplies the kind-specific
 * pieces (the KINDS table above): the lib functions and the copy.
 */
export function SaveButton({ kind = "place", itemId, onToggle }: Readonly<SaveButtonProps>) {
  const copy = KINDS[kind];
  const { saved, loading, error, handleClick } = useSavedToggle({
    itemId,
    fetchIsSaved: copy.fetchIsSaved,
    toggle: copy.toggle,
    saveErrorMessage: copy.saveErrorMessage,
    removeErrorMessage: copy.removeErrorMessage,
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
        aria-label={saved ? copy.removeLabel : copy.saveLabel}
        aria-pressed={saved}
      >
        <Heart weight={saved ? "fill" : "bold"} className={cn("h-5 w-5", saved && "text-primary")} />
      </Button>
      {/* Phase 8.3: specific to which direction failed (save vs remove),
          not "something went wrong," per ux-ui-guidelines.md's State
          Rules. text-destructive matches this codebase's one existing
          error-message convention rather than a new color invented here. */}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
