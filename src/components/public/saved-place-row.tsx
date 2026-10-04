import { VerificationBadge } from "./result-card";
import { SaveButton } from "./save-button";
import type { DiscoverPlace } from "@/lib/discover-types";
import type { SavedBusiness } from "@/lib/saved-businesses";

/**
 * The Saved page's Places and Businesses card. Was a list row (name,
 * category, badge, heart in one line); now a photo card in the Home style
 * (category-photo-row.tsx's PhotoCard): cover photo with the name over it,
 * same scrim recipe, same hover lift. File and export keep their old names
 * (constraints.md: no renames without approval), the shape is a card now.
 *
 * Not a reuse of PhotoCard itself: that card is a fixed-width strip tile
 * inside one button, and this one needs a fluid grid cell with the heart as
 * a sibling of the tap target (a button cannot contain another button, same
 * composition as before, applied to a card). The category, the verification
 * badge and the heart sit in a footer under the photo, so a failed unsave's
 * error line (SaveButton) lands on the card surface, not on the photo.
 *
 * Takes either kind (two callers, one shape), `kind` picks the heart's
 * table. SaveButton's onToggle removes the card from the Saved list the
 * moment it is unsaved.
 */
interface SavedPlaceRowProps {
  place: DiscoverPlace | SavedBusiness;
  kind?: "place" | "business";
  onClick: () => void;
  onUnsave: () => void;
}

export function SavedPlaceRow({ place, kind = "place", onClick, onUnsave }: Readonly<SavedPlaceRowProps>) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-transform hover:-translate-y-0.5">
      <button
        type="button"
        onClick={onClick}
        className="relative block aspect-square w-full shrink-0 bg-muted bg-cover bg-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        style={{ backgroundImage: place.coverPhotoUrl ? `url(${place.coverPhotoUrl})` : undefined }}
      >
        {/* Same scrim as Home's PhotoCard (decision-log.md entry #2). */}
        <span
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to top, rgb(0 48 103 / 0.85), transparent)" }}
        />
        <span className="relative flex h-full flex-col justify-end p-3">
          <span className="line-clamp-2 text-sm font-semibold text-primary-foreground">{place.name}</span>
        </span>
      </button>
      <div className="flex flex-1 items-start justify-between gap-2 p-2">
        <div className="flex min-w-0 flex-col gap-1">
          {place.category && <span className="truncate text-xs text-muted-foreground">{place.category}</span>}
          <VerificationBadge status={place.verification_status} />
        </div>
        <SaveButton kind={kind} itemId={place.id} onToggle={(saved) => !saved && onUnsave()} />
      </div>
    </div>
  );
}
