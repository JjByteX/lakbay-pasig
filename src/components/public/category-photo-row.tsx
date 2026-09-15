import { Skeleton } from "@/components/ui/skeleton";
import type { RecentlyVerifiedItem } from "@/lib/home-types";

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
}

interface CategoryPhotoRowProps {
  categoryName: string;
  items: CategoryPhotoRowItem[];
  onSelect: (item: CategoryPhotoRowItem) => void;
}

// Phase 3.4: fixed card width, in sync with the skeleton's own width below
// so a loading row and a loaded row occupy the same footprint (no layout
// jump when data arrives). Named constants rather than a bare Tailwind
// class repeated in two places, since SectionSkeleton-style row skeletons
// (home.tsx) already establish "same shape as the loaded content" as this
// codebase's own loading-state convention (Phase 3.5 below), which only
// holds if both places agree on one width.
const CARD_WIDTH_PX = 144;
const CARD_HEIGHT_PX = 144;

// Phase 3.2: one photo card -- cover photo as the background, name
// overlaid at the bottom over a scrim. Same scrim recipe auth-layout.tsx
// already uses for its own image-panel tagline (decision-log.md entry #2):
// an absolutely-positioned gradient from a dark, near-opaque base up to
// transparent, with the label sitting inside that gradient's opaque end,
// rather than inventing a new overlay treatment for this card.
function PhotoCard({ item, onSelect }: Readonly<{ item: CategoryPhotoRowItem; onSelect: (item: CategoryPhotoRowItem) => void }>) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group relative shrink-0 overflow-hidden rounded-lg border border-border bg-cover bg-center text-left transition-transform hover:-translate-y-0.5"
      style={{
        width: CARD_WIDTH_PX,
        height: CARD_HEIGHT_PX,
        backgroundImage: item.coverPhotoUrl ? `url(${item.coverPhotoUrl})` : undefined,
      }}
    >
      {!item.coverPhotoUrl && <div className="absolute inset-0 bg-muted" />}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{
          background: "linear-gradient(to top, rgb(7 46 87 / 0.85), transparent)",
        }}
      />
      {/* Phase 3.2: no verification badge here -- home.tsx's Places/
          Businesses framing (Phase 5.2) already states every card in this
          section is verified, so a per-card badge would repeat that fact
          on every tile rather than add information. */}
      <span className="relative flex h-full flex-col justify-end p-3">
        <span className="line-clamp-2 text-sm font-semibold text-primary-foreground">
          {item.name}
        </span>
      </span>
    </button>
  );
}

// Phase 3.5: skeleton cards, same count (three, matching SectionSkeleton's
// own three-row convention in home.tsx) and same fixed width/height as the
// loaded PhotoCard above, laid out as a row instead of stacked -- widened
// from SectionSkeleton's vertical shape rather than a new pattern.
export function CategoryPhotoRowSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-5 w-32" />
      <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className="shrink-0 rounded-lg"
            style={{ width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX }}
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
 * inside the max-w-md page shell, while the heading above it stays within
 * the page's normal padding.
 */
export function CategoryPhotoRow({ categoryName, items, onSelect }: Readonly<CategoryPhotoRowProps>) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">{categoryName}</h3>
      <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1">
        {items.map((item) => (
          <PhotoCard key={`${item.kind}-${item.id}`} item={item} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
