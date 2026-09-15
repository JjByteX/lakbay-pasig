import { VerificationBadge } from "./result-card";
import type { RecentlyVerifiedItem } from "@/lib/home-types";

/**
 * Phase 5.2 (step-6-phases.md): row, same shape as announcement-card.tsx
 * and discover-list.tsx's row button, name/category/badge. VerificationBadge
 * imported from result-card.tsx, not rebuilt, per constraints.md's
 * Inventory Before Suggesting rule; every caller of this component only
 * ever passes verification_status "verified" -- originally guaranteed by
 * home-query.ts's fetchRecentlyVerified (both source tables filtered to
 * verified only), and still true after home-photo-showcase-phases.md
 * Phase 7.1 removed that function in favor of fetchHomeShowcase, which
 * applies the exact same verified-only filtering to the two functions
 * (fetchRecentlyVerifiedPlaces/Businesses) it shares with that old feed.
 * "verified" is a valid member of the badge's "verified" | "pending" prop
 * type, so no widening or extra branch needed here.
 */
interface VerifiedItemCardProps {
  item: RecentlyVerifiedItem;
  onClick: () => void;
}

export function VerifiedItemCard({ item, onClick }: Readonly<VerifiedItemCardProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start gap-1 px-6 py-4 text-left transition-colors hover:bg-muted"
    >
      <span className="text-base font-semibold text-foreground">{item.name}</span>
      <span className="text-sm text-muted-foreground">{item.category}</span>
      <VerificationBadge status={item.verification_status} />
    </button>
  );
}
