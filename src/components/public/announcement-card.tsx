import { Badge } from "@/components/ui/badge";
import type { Announcement } from "@/lib/home-types";

/**
 * Phase 3.4 (step-6-phases.md): row, not a card wrapper, same
 * no-card-inside-a-list-row pattern discover-list.tsx's row button already
 * uses. Plain button so Phase 4.5 only has to add an onClick, no shape
 * change needed once the event detail route exists.
 *
 * Category badge uses `secondary`, matching discover-place-detail.tsx's
 * facilities chip treatment: a neutral tag, not a status. `default` and
 * `outline` stay reserved for the verification-status meaning they already
 * carry elsewhere in this codebase (VerificationBadge, admin STATUS_VARIANT
 * maps), reusing either here for an unrelated concept would blur that
 * meaning, per ux-ui-guidelines.md's "same icon/style per concept
 * everywhere" rule.
 */
function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface AnnouncementCardProps {
  announcement: Announcement;
  onClick: () => void;
}

export function AnnouncementCard({ announcement, onClick }: AnnouncementCardProps) {
  const formattedDate = formatDateTime(announcement.date_time);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start gap-1 px-6 py-4 text-left transition-colors hover:bg-muted"
    >
      <span className="text-base font-semibold text-foreground">{announcement.title}</span>
      {(formattedDate || announcement.location) && (
        <span className="text-sm text-muted-foreground">
          {[formattedDate, announcement.location].filter(Boolean).join(" · ")}
        </span>
      )}
      {announcement.category && <Badge variant="secondary">{announcement.category}</Badge>}
    </button>
  );
}
