import { VerificationBadge } from "./result-card";
import type { RecentlyVerifiedItem } from "@/lib/home-types";

/**
 * Phase 5.2 (step-6-phases.md): row, same shape as announcement-card.tsx
 * and discover-list.tsx's row button, name/category/badge. VerificationBadge
 * imported from result-card.tsx, not rebuilt, per constraints.md's
 * Inventory Before Suggesting rule; this list only ever carries
 * verification_status "verified" (home-query.ts's fetchRecentlyVerified
 * filters both tables to verified only), a valid member of the badge's
 * "verified" | "pending" prop type, so no widening or extra branch needed
 * here.
 */
interface VerifiedItemCardProps {
  item: RecentlyVerifiedItem;
  onClick: () => void;
}

export function VerifiedItemCard({ item, onClick }: VerifiedItemCardProps) {
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
