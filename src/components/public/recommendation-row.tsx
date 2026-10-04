import { useNavigate } from "react-router-dom";
import {
  CategoryPhotoRow,
  CategoryPhotoRowSkeleton,
  type CategoryPhotoRowItem,
} from "@/components/public/category-photo-row";
import { useRecommendations, type RecommendationAnchor } from "@/lib/recommendations";
import { distanceFromHere, kmAway } from "@/lib/distance-label";

// Reasons the function gives only to say "close by". When the card shows a
// distance line the reason would say the same thing twice ("Near you" above
// "350 m away"), so the distance replaces it. "Open now" and "Similar to X"
// say something else and stay.
const REASONS_SAID_BY_DISTANCE = new Set(["Near you", "Nearby"]);

/**
 * The recommendation row (recommendation-plan.md, Scope; recommendation-
 * phases.md Phases 8 and 10): Home's "For you" / "Near you" / "Around Pasig"
 * row, and the "Similar" row on place and business detail pages. Three callers
 * share it (Home and both detail pages), so it is one component rather than
 * three copies of the same hook, skeleton, mapping and routing.
 *
 * Without an anchor it is the Home row and picks its own title from what the
 * function could use: no usable location is "Around Pasig", otherwise signed in
 * is "For you" and a guest is "Near you". With an anchor the caller passes the
 * title ("Similar"). The cards' reason lines come from the function. With no
 * usable location it sends none for "Near you" or "Open now", since the title
 * already says it. A Similar row is measured from the page item, not the
 * person (migration 0048), so its cards read "350 m from here", never "away",
 * and it does not depend on the person's location at all. Where a card shows a
 * distance, it replaces the "Near you" / "Nearby" reason instead of repeating
 * it.
 *
 * The row is optional: while loading it shows one skeleton, and on an empty
 * result or an error it renders nothing, so it never blocks the page and never
 * shows an error (the plan says the row never errors or shows empty).
 */
export function RecommendationRow({
  anchor,
  title,
}: Readonly<{ anchor?: RecommendationAnchor; title?: string }>) {
  const navigate = useNavigate();
  const { cards, loading, locationUsed, canHide, hide, undo, hiddenIds, hideError } = useRecommendations(anchor);

  if (loading) return <CategoryPhotoRowSkeleton withStrip />;
  if (cards.length === 0) return null;

  let heading = title;
  if (!heading) {
    if (!locationUsed) heading = "Around Pasig";
    else heading = canHide ? "For you" : "Near you";
  }

  // distance_km is from the person on the Home row and from the page item on a
  // Similar row (migration 0048), so the words differ: "away" or "from here".
  // The function sends no distance when it has no usable centre, and then no
  // line shows.
  const items: CategoryPhotoRowItem[] = cards.map((card) => {
    const distanceLabel = anchor ? distanceFromHere(card.distanceKm) : kmAway(card.distanceKm);
    return {
      id: card.id,
      kind: card.kind,
      name: card.name,
      coverPhotoUrl: card.coverPhotoUrl,
      reason: distanceLabel && card.reason && REASONS_SAID_BY_DISTANCE.has(card.reason) ? null : card.reason,
      distanceLabel,
      verificationStatus: card.verification_status,
    };
  });

  // Not interested: only for a signed in user (guests store nothing), and only
  // on these rows. Search, Discover and trails keep showing the item.
  return (
    <div className="flex flex-col gap-2">
      <CategoryPhotoRow
        categoryName={heading}
        items={items}
        onSelect={(item) => navigate(`/discover/${item.kind}/${item.id}`)}
        onHide={canHide ? hide : undefined}
        onUndo={undo}
        hiddenIds={hiddenIds}
      />
      {hideError && (
        <p role="alert" className="text-sm text-destructive">
          {hideError}
        </p>
      )}
    </div>
  );
}
