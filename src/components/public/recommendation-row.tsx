import { useNavigate } from "react-router-dom";
import {
  CategoryPhotoRow,
  CategoryPhotoRowSkeleton,
  type CategoryPhotoRowItem,
} from "@/components/public/category-photo-row";
import { useRecommendations, type RecommendationAnchor } from "@/lib/recommendations";

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
 * already says it.
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

  const items: CategoryPhotoRowItem[] = cards.map((card) => ({
    id: card.id,
    kind: card.kind,
    name: card.name,
    coverPhotoUrl: card.coverPhotoUrl,
    reason: card.reason,
    verificationStatus: card.verification_status,
  }));

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
