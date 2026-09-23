/**
 * Map hover/full-details photos phase: a plain horizontal photo strip for
 * a place/business detail page's own uploaded photos (place_photos /
 * business_photos), reached from result-card.tsx's "View full details"
 * link per direct instruction ("When view full details, show picture(s)
 * that are uploaded by the place/business in details"). Shared by
 * discover-place-detail.tsx and discover-business-detail.tsx rather than
 * two near-identical strips, since both pages need the exact same shape:
 * an ordered list of photo URLs, first one large, the rest (if any) as a
 * smaller scrollable strip beneath it.
 *
 * Same native horizontal-scroll pattern category-photo-row.tsx's own Home
 * showcase strip already established for this codebase (-mx-6 flex gap-3
 * overflow-x-auto px-6, bleeding the strip to the page's full width while
 * the rest of the page keeps its normal padding) -- no new carousel
 * library, confirmed none exists here already (that file's own Phase 3.1
 * comment).
 *
 * Renders nothing when the list is empty: an empty gallery block has
 * nothing useful to say beyond what the page's own "No details listed
 * yet" (or equivalent) message already covers elsewhere, so this adds no
 * empty-state message of its own -- the caller simply doesn't get a
 * gallery section for a place/business with no uploaded photos yet.
 */
export function PhotoGallery({ photoUrls }: Readonly<{ photoUrls: string[] }>) {
  if (photoUrls.length === 0) return null;

  const [first, ...rest] = photoUrls;

  return (
    <div className="-mx-6 flex flex-col gap-2">
      <img
        src={first}
        alt=""
        className="aspect-[4/3] w-full object-cover"
      />
      {rest.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-6 pb-1">
          {rest.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
