import { useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { fetchAnnouncements, fetchHomeShowcase } from "@/lib/home-query";
import type { Announcement, CategoryRow, RecentlyVerifiedItem } from "@/lib/home-types";
import { AnnouncementCarousel } from "@/components/public/announcement-carousel";
import { VerifiedItemCard } from "@/components/public/verified-item-card";
import {
  CategoryPhotoRow,
  CategoryPhotoRowSkeleton,
  type CategoryPhotoRowItem,
} from "@/components/public/category-photo-row";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/lib/page-title";

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

// Phase 6.1 (step-6-phases.md): three row-shaped skeletons, same primitive
// and row-shape pattern discover-list.tsx's own loading branch already
// uses (name/detail/badge-sized bars), not a spinner. Used for the
// Announcements section above and the fallback list below -- both keep
// this same three-line row shape. The photo showcase's own category rows
// use CategoryPhotoRowSkeleton (category-photo-row.tsx, home-photo-
// showcase-phases.md Phase 3.5) instead, a different shape (a horizontal
// strip of photo tiles, not stacked text rows), so this component wasn't
// widened to cover both.
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
  usePageTitle(null);
  const navigate = useNavigate();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);

  // home-photo-showcase-phases.md Phase 5.1: fetchHomeShowcase (home-
  // query.ts Phase 2.3) replaces fetchRecentlyVerified here -- one call
  // returning three lists (place category rows, business category rows,
  // fallback items), held as three pieces of state but covered by one
  // loading flag and one error state, matching Phase 5.1's own corrected
  // shape (not three separate loading/error signals for three outputs of
  // the same single fetch). Still its own effect, independent from
  // announcements above, same "a slow places/businesses query and a slow
  // events query are unrelated causes" reasoning the original Phase 5.1
  // comment already gave.
  const [placeCategoryRows, setPlaceCategoryRows] = useState<CategoryRow[]>([]);
  const [businessCategoryRows, setBusinessCategoryRows] = useState<CategoryRow[]>([]);
  const [fallbackItems, setFallbackItems] = useState<RecentlyVerifiedItem[]>([]);
  const [showcaseLoading, setShowcaseLoading] = useState(true);
  const [showcaseError, setShowcaseError] = useState<string | null>(null);

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

  useEffect(() => {
    setShowcaseLoading(true);
    setShowcaseError(null);
    fetchHomeShowcase()
      .then((data) => {
        setPlaceCategoryRows(data.placeCategoryRows);
        setBusinessCategoryRows(data.businessCategoryRows);
        setFallbackItems(data.fallbackItems);
      })
      .catch((err: unknown) => {
        setShowcaseError(errorMessageFrom(err, "Could not load recently verified content."));
        setPlaceCategoryRows([]);
        setBusinessCategoryRows([]);
        setFallbackItems([]);
      })
      .finally(() => setShowcaseLoading(false));
  }, []);

  // Extracted from a nested ternary (announcementsError ? ... :
  // announcementsLoading ? ... : announcements.length === 0 ? ... : ...)
  // inline in the Announcements section below. Error checked first, ahead
  // of loading and empty, per discover-list.tsx's established ordering: an
  // error is a more specific and more serious condition than either "still
  // waiting" or "completed with nothing to show."
  let announcementsBody: ReactNode;
  if (announcementsError) {
    announcementsBody = <p className="text-sm text-destructive">{announcementsError}</p>;
  } else if (announcementsLoading) {
    announcementsBody = <SectionSkeleton />;
  } else if (announcements.length === 0) {
    announcementsBody = <p className="text-sm text-muted-foreground">No announcements yet.</p>;
  } else {
    announcementsBody = (
      <AnnouncementCarousel
        announcements={announcements}
        onOpen={(id) => navigate(`/events/${id}`)}
      />
    );
  }

  // Same reasoning as announcementsBody above: error checked first, ahead
  // of loading and empty.
  //
  // home-photo-showcase-phases.md Phase 5.3: a single onSelect used by
  // both CategoryPhotoRow (photo cards) and VerifiedItemCard (fallback
  // list rows) below, navigating to the same /discover/:kind/:id route
  // home.tsx already used for this section before this feature -- no
  // route change needed, no pre-filtered Discover handoff, matching
  // home-photo-showcase-plan.md's own Tap Behavior section.
  const openItem = (item: CategoryPhotoRowItem | RecentlyVerifiedItem) =>
    navigate(`/discover/${item.kind}/${item.id}`);

  // Phase 5.4: one combined empty check across every category row list
  // and the fallback list, so an all-empty showcase shows one message
  // instead of three near-identical ones (Places empty, Businesses empty,
  // fallback empty) -- matches ux-ui-guidelines.md's rule against
  // repeating the same message twice in an empty state, extended here to
  // not stacking three of them.
  const showcaseIsEmpty =
    placeCategoryRows.length === 0 &&
    businessCategoryRows.length === 0 &&
    fallbackItems.length === 0;

  let showcaseBody: ReactNode;
  if (showcaseError) {
    // Phase 5.5: one error boundary for the whole section, covered by
    // fetchHomeShowcase's own single-fetch, split-after shape -- one
    // promise to catch, one error state to show here.
    showcaseBody = <p className="text-sm text-destructive">{showcaseError}</p>;
  } else if (showcaseLoading) {
    showcaseBody = (
      <div className="flex flex-col gap-6">
        <CategoryPhotoRowSkeleton />
        <CategoryPhotoRowSkeleton />
      </div>
    );
  } else if (showcaseIsEmpty) {
    showcaseBody = <p className="text-sm text-muted-foreground">No recently verified content yet.</p>;
  } else {
    showcaseBody = (
      <div className="flex flex-col gap-6">
        {/* Phase 5.2: Places heading, one CategoryPhotoRow per place
            category row, in order. Section itself is omitted (not shown
            with an empty sub-heading) when there are no place category
            rows to show, same reasoning the Businesses and fallback
            sections below apply to their own empty case -- the combined
            showcaseIsEmpty check above already covers the "nothing at
            all" case, this is the "something, just not this kind" case. */}
        {placeCategoryRows.length > 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-foreground">Places</h2>
            {placeCategoryRows.map((row) => (
              <CategoryPhotoRow
                key={row.categoryId}
                categoryName={row.categoryName}
                items={row.items}
                onSelect={openItem}
              />
            ))}
          </div>
        )}

        {/* Phase 5.2: Businesses heading, same shape as Places above. */}
        {businessCategoryRows.length > 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-foreground">Businesses</h2>
            {businessCategoryRows.map((row) => (
              <CategoryPhotoRow
                key={row.categoryId}
                categoryName={row.categoryName}
                items={row.items}
                onSelect={openItem}
              />
            ))}
          </div>
        )}

        {/* Phase 5.2: fallback list heading, reusing verified-item-
            card.tsx exactly as it renders today (Phase 4.1 confirmed no
            changes needed there). */}
        {fallbackItems.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">More verified listings</h2>
            <ul className="-mx-6 flex flex-col divide-y divide-border">
              {fallbackItems.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <VerifiedItemCard item={item} onClick={() => openItem(item)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Announcements</h2>
        {announcementsBody}
      </div>

      {showcaseBody}
    </div>
  );
}
