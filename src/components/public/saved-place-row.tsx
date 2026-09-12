import { VerificationBadge } from "./result-card";
import { SaveButton } from "./save-button";
import type { DiscoverPlace } from "@/lib/discover-types";

/**
 * Step 8, Phase 3.1: Saved page's Saved Places row. Not a reuse of
 * verified-item-card.tsx: that component's prop type is RecentlyVerifiedItem
 * (home-types.ts), which requires a verified_at field a saved place has no
 * reason to carry, per architecture-notes.md's Step 8 Phase 1 changelog
 * entry ("resolved by keeping fetchSavedPlaces on DiscoverPlace and adding
 * a small saved-place-row.tsx in Phase 3 rather than loosening
 * VerifiedItemCard's prop type or borrowing places.verified_at for an
 * unrelated meaning"). Same name/category/VerificationBadge content as
 * verified-item-card.tsx's row, VerificationBadge imported from
 * result-card.tsx as-is per constraints.md's Inventory Before Suggesting
 * rule, not rebuilt.
 *
 * Row shape differs from verified-item-card.tsx's bare `<button>` because
 * this row also carries a heart control (step-8-plan.md: "Saved is not
 * read only"). A button cannot nest another interactive button, so the
 * tap target and the heart sit as siblings in one flex row, the same
 * composition discover-place-detail.tsx and trail-detail.tsx already use
 * for a back button next to a SaveButton/SaveRouteButton, applied here at
 * row level instead of page-header level rather than inventing a new
 * pattern.
 *
 * SaveButton's only change this phase is the new optional onToggle prop
 * (save-button.tsx); passing onToggle={(saved) => !saved && onUnsave()}
 * here lets this row disappear from the Saved page's list the moment
 * it's unsaved, without SaveButton needing to know it's being rendered
 * inside a list.
 */
interface SavedPlaceRowProps {
  place: DiscoverPlace;
  onClick: () => void;
  onUnsave: () => void;
}

export function SavedPlaceRow({ place, onClick, onUnsave }: SavedPlaceRowProps) {
  return (
    <div className="flex w-full items-center gap-2 px-6 py-4">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        <span className="truncate text-base font-semibold text-foreground">{place.name}</span>
        <span className="text-sm text-muted-foreground">{place.category}</span>
        <VerificationBadge status={place.verification_status} />
      </button>
      <SaveButton placeId={place.id} onToggle={(saved) => !saved && onUnsave()} />
    </div>
  );
}
