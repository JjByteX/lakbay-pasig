import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchAnnouncements, fetchRecentlyVerified } from "@/lib/home-query";
import type { Announcement, RecentlyVerifiedItem } from "@/lib/home-types";
import { AnnouncementCard } from "@/components/public/announcement-card";
import { VerifiedItemCard } from "@/components/public/verified-item-card";
import { Skeleton } from "@/components/ui/skeleton";

// Phase 6 (step-6-phases.md): cross-cutting loading/empty/error pass across
// both sections, run as one dedicated pass rather than baked into Phase 3/5,
// matching how step 5's own Phase 8 handled this (architecture-notes.md's
// changelog, Phase 8 entries). Each section keeps its own loading and error
// state, same independent-signals reasoning Phase 5.1's comment already
// gives (a slow places/businesses query and a slow events query are
// unrelated causes) extended to failure, not just to "still waiting."
//
// Read helper below returns a Supabase PostgrestError's .message when
// present, same shape-check discover.tsx's Phase 8.3 fetch already uses
// (a plain object with a .message field, not an Error subclass), with a
// named fallback for anything else (e.g. a raw network failure before a
// response is even received). Reused for both sections rather than
// duplicating the same three-line check twice, per constraints.md's
// Inventory Before Suggesting rule.
function errorMessageFrom(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string"
    ? err.message
    : fallback;
}

// Phase 6.1: three row-shaped skeletons, same primitive and row-shape
// pattern discover-list.tsx's own loading branch already uses (name/detail/
// badge-sized bars), not a spinner. Shared by both sections below since
// both rows share the same three-line shape (title, detail line, badge).
function SectionSkeleton() {
  return (
    <ul className="-mx-6 flex flex-col divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex flex-col gap-2 px-6 py-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-20" />
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);

  const [recentlyVerified, setRecentlyVerified] = useState<RecentlyVerifiedItem[]>([]);
  const [recentlyVerifiedLoading, setRecentlyVerifiedLoading] = useState(true);
  const [recentlyVerifiedError, setRecentlyVerifiedError] = useState<string | null>(null);

  useEffect(() => {
    setAnnouncementsLoading(true);
    setAnnouncementsError(null);
    fetchAnnouncements()
      .then((data) => setAnnouncements(data))
      .catch((err: unknown) => {
        setAnnouncementsError(errorMessageFrom(err, "Could not load announcements."));
        setAnnouncements([]);
      })
      .finally(() => setAnnouncementsLoading(false));
  }, []);

  // Phase 5.1: own effect, own loading boolean, independent from
  // announcements above. A slow places/businesses query and a slow events
  // query are unrelated causes, matching how discover.tsx already keeps
  // query loading and tile loading as two separate signals rather than one
  // shared flag that would mean two different things.
  useEffect(() => {
    setRecentlyVerifiedLoading(true);
    setRecentlyVerifiedError(null);
    fetchRecentlyVerified()
      .then((data) => setRecentlyVerified(data))
      .catch((err: unknown) => {
        setRecentlyVerifiedError(errorMessageFrom(err, "Could not load recently verified content."));
        setRecentlyVerified([]);
      })
      .finally(() => setRecentlyVerifiedLoading(false));
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Announcements</h2>
        {/* Phase 6.3: error checked first, ahead of loading and empty, per
            discover-list.tsx's established ordering, an error is a more
            specific and more serious condition than either "still waiting"
            or "completed with nothing to show." text-destructive reused
            as-is, this codebase's one existing error-message convention. */}
        {announcementsError ? (
          <p className="text-sm text-destructive">{announcementsError}</p>
        ) : announcementsLoading ? (
          <SectionSkeleton />
        ) : announcements.length === 0 ? (
          // Phase 6.2: distinct wording per section, ux-ui-guidelines.md's
          // Label Rules ban restating the same idea twice, these are two
          // different concepts (nothing published vs nothing verified yet).
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        ) : (
          <ul className="-mx-6 flex flex-col divide-y divide-border">
            {announcements.map((announcement) => (
              <li key={announcement.id}>
                <AnnouncementCard
                  announcement={announcement}
                  onClick={() => navigate(`/events/${announcement.id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Recently verified</h2>
        {recentlyVerifiedError ? (
          <p className="text-sm text-destructive">{recentlyVerifiedError}</p>
        ) : recentlyVerifiedLoading ? (
          <SectionSkeleton />
        ) : recentlyVerified.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recently verified content yet.</p>
        ) : (
          <ul className="-mx-6 flex flex-col divide-y divide-border">
            {recentlyVerified.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <VerifiedItemCard
                  item={item}
                  onClick={() => navigate(`/discover/${item.kind}/${item.id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
