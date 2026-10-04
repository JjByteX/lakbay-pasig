import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, DotsThreeVertical, EyeSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecentlyVerifiedItem } from "@/lib/home-types";
import { VerificationBadge } from "./result-card";
import { PhotoCaptionOverlay } from "./photo-caption-overlay";
import { itemKey } from "@/lib/recommendations";

/**
 * home-photo-showcase-phases.md Phase 3.1: one row for the Home photo
 * showcase (home-photo-showcase-plan.md) -- a category name as a heading,
 * then a horizontal strip of photo cards for that category's verified,
 * photo-having items. Shared by both the Places block and the Businesses
 * block (home-query.ts's CategoryRow type is already one shared shape for
 * both, per home-types.ts Phase 1.2's own comment), so this component
 * takes plain props, not a CategoryRow directly, keeping it agnostic to
 * which kind of category produced its items.
 */

// Phase 3.1: an item as this row needs it -- id, name, kind (for the
// combined React key and for onSelect to route on), coverPhotoUrl. Not
// RecentlyVerifiedItem's full shape reused wholesale, this component only
// ever reads these four fields, but RecentlyVerifiedItem already satisfies
// this shape structurally, so callers (home.tsx, Phase 5) can pass a
// CategoryRow's own items array straight through with no mapping step.
export interface CategoryPhotoRowItem {
  id: string;
  kind: RecentlyVerifiedItem["kind"];
  name: string;
  coverPhotoUrl: string | null;
  // Recommendations (recommendation-plan.md, Reason label): both optional, so
  // the existing verified-only rows pass neither and look the same. A reason
  // ("Near you", "Open now", "Similar to X") shows under the photo. A status
  // shows the verification badge, which the recommendation rows need on every
  // card because they mix Verified and Pending businesses.
  reason?: string | null;
  verificationStatus?: "verified" | "pending";
  // "350 m away" or "350 m from here", already worded by the caller. Its own
  // line under the reason, so a long reason ("Similar to ...") is never
  // squeezed by it. Null or absent shows nothing.
  distanceLabel?: string | null;
}

interface CategoryPhotoRowProps {
  categoryName: string;
  items: CategoryPhotoRowItem[];
  onSelect: (item: CategoryPhotoRowItem) => void;
  // "Not interested". The control only renders when this is given, so guests
  // (who cannot hide) never see it. Recommendation rows only.
  onHide?: (item: CategoryPhotoRowItem) => void;
  // Items hidden in this view (itemKey of each). A hidden card turns into one
  // "Hidden. Undo" line in place, same footprint, so the row does not shift.
  // There is no toast primitive in the app, so the undo lives on the card.
  hiddenIds?: ReadonlySet<string>;
  onUndo?: (item: CategoryPhotoRowItem) => void;
}

// Phase 3.4: fixed card size, shared by the card and the skeleton below so
// a loading row and a loaded row occupy the same footprint (no layout jump
// when data arrives). One class string rather than inline px so it can step
// up at md (144px -> 176px) for desktop; both are on the 8px grid.
const CARD_SIZE = "h-36 w-36 md:h-44 md:w-44";
const CARD_WIDTH = "w-36 md:w-44";
const PHOTO_HEIGHT = "h-36 md:h-44";
// Recommendation cards add a caption strip (reason and badge) under the square
// photo. The strip is as tall as its content and no taller: cards in one row
// already stretch to the tallest, and a reserved blank area showed up as dead
// space whenever a row had no reason lines (the "Around Pasig" case). The
// skeleton is a typical card, photo plus a one line reason and a two line
// badge, so a loaded row lands close to it.
const CARD_WITH_STRIP_HEIGHT = "h-52 md:h-[248px]";

// Phase 3.2: one photo card -- cover photo as the background, name
// overlaid at the bottom. The overlay is PhotoCaptionOverlay: white text on a
// soft blur and a neutral black gradient, the same treatment as the landing
// hero's caption. It replaced the navy scrim with theme-colored text, which
// was dark text on a dark scrim in dark mode (see that file's comment).
function PhotoCard({
  item,
  onSelect,
  onHide,
  hidden = false,
  onUndo,
}: Readonly<{
  item: CategoryPhotoRowItem;
  onSelect: (item: CategoryPhotoRowItem) => void;
  onHide?: (item: CategoryPhotoRowItem) => void;
  hidden?: boolean;
  onUndo?: (item: CategoryPhotoRowItem) => void;
}>) {
  const hasStrip = item.reason != null || item.distanceLabel != null || item.verificationStatus != null;
  if (hidden) {
    return (
      <div
        className={`flex shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted p-3 ${CARD_WIDTH}`}
      >
        <p role="status" className="text-sm text-foreground">
          Hidden.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => onUndo?.(item)}>
          Undo
        </Button>
      </div>
    );
  }
  // The select button and the hide control are siblings inside one wrapper: a
  // button inside a button is invalid HTML.
  return (
    <div className={`relative shrink-0 transition-transform hover:-translate-y-0.5 ${CARD_WIDTH}`}>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={`relative block w-full shrink-0 bg-cover bg-center ${PHOTO_HEIGHT}`}
          style={{
            backgroundImage: item.coverPhotoUrl ? `url(${item.coverPhotoUrl})` : undefined,
          }}
        >
          {!item.coverPhotoUrl && <span className="absolute inset-0 bg-muted" />}
          {/* Phase 3.2: the verified-only rows show no badge here -- home.tsx's
              Places/Businesses framing (Phase 5.2) already states every card
              in that section is verified. A recommendation row mixes Verified
              and Pending, so its cards carry the badge in the strip below. */}
          <PhotoCaptionOverlay name={item.name} />
        </span>
        {hasStrip && (
          <span className="flex flex-1 flex-col gap-1 bg-card p-2">
            {item.reason && (
              <span className="line-clamp-2 text-xs text-muted-foreground">{item.reason}</span>
            )}
            {item.distanceLabel && (
              <span className="text-xs text-muted-foreground">{item.distanceLabel}</span>
            )}
            {item.verificationStatus && <VerificationBadge status={item.verificationStatus} />}
          </span>
        )}
      </button>
      {/* A plain filled circle, no ring: the photo can be any color, so the dots
          sit on the card surface (Booking and Pinterest do the same for the
          control they put on a photo), and a ring would only add a second edge. */}
      {onHide && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute right-2 top-2 h-10 w-10 rounded-full border-transparent"
              aria-label={`More options for ${item.name}`}
            >
              <DotsThreeVertical className="h-5 w-5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2" onSelect={() => onHide(item)}>
              <EyeSlash className="h-4 w-4" aria-hidden="true" />
              Not interested
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// Phase 3.5: skeleton cards, same count (three, matching SectionSkeleton's
// own three-row convention in home.tsx) and same fixed width/height as the
// loaded PhotoCard above, laid out as a row instead of stacked -- widened
// from SectionSkeleton's vertical shape rather than a new pattern.
export function CategoryPhotoRowSkeleton({ withStrip = false }: Readonly<{ withStrip?: boolean }> = {}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center md:min-h-8">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className={`shrink-0 rounded-lg ${withStrip ? `${CARD_WIDTH} ${CARD_WITH_STRIP_HEIGHT}` : CARD_SIZE}`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Phase 3.1/3.3/3.4: category name as a row heading, then a native
 * horizontal-scroll strip (overflow-x-auto + flex row) of PhotoCards, no
 * carousel library -- confirmed against Phase 0.3, no existing component
 * in this codebase already does a horizontal photo-strip row (announcement-
 * carousel.tsx is a single-tile auto-advancing carousel, a different
 * shape), and no scroll library is installed, so a plain scroll container
 * is the smallest thing that works here. Card tap calls onSelect(item),
 * no route logic inside this component -- routing stays a home.tsx
 * concern (Phase 5.3), same separation verified-item-card.tsx's own
 * onClick prop already keeps today.
 *
 * -mx-6/px-6 matches SectionSkeleton's own convention in home.tsx: the
 * row bleeds to the page's full width so the strip can scroll edge-to-edge
 * inside the page container (page-container.tsx), while the heading above it stays within
 * the page's normal padding.
 */
export function CategoryPhotoRow({
  categoryName,
  items,
  onSelect,
  onHide,
  hiddenIds,
  onUndo,
}: Readonly<CategoryPhotoRowProps>) {
  // Desktop arrows: a mouse has no swipe, and the thin scrollbar is easy to
  // miss. Shown at md+ only, and only while the strip actually overflows;
  // each end disables itself at the edge. Native scrollBy, no library.
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const update = () =>
      setEdges({
        prev: el.scrollLeft > 0,
        next: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [items.length]);

  const scrollPage = (direction: -1 | 1) => {
    const el = stripRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* md:min-h-8 holds the heading row at the arrow buttons' height, so
          a row that overflows and one that doesn't line up the same. */}
      <div className="flex items-center justify-between md:min-h-8">
        <h3 className="text-sm font-semibold text-foreground">{categoryName}</h3>
        {(edges.prev || edges.next) && (
          <div className="hidden gap-2 md:flex">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Scroll left"
              disabled={!edges.prev}
              onClick={() => scrollPage(-1)}
            >
              <CaretLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Scroll right"
              disabled={!edges.next}
              onClick={() => scrollPage(1)}
            >
              <CaretRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <div ref={stripRef} className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1">
        {items.map((item) => (
          <PhotoCard
            key={`${item.kind}-${item.id}`}
            item={item}
            onSelect={onSelect}
            onHide={onHide}
            hidden={hiddenIds?.has(itemKey(item)) ?? false}
            onUndo={onUndo}
          />
        ))}
      </div>
    </div>
  );
}
