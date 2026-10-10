import { useEffect, useRef, useState, type ReactNode } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { readEmbeddedName } from "@/lib/place-categories";
import { Input } from "@/components/ui/input";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PhotoCaptionOverlay } from "@/components/public/photo-caption-overlay";
import { fetchCoverPhotoUrls } from "@/lib/home-query";

// Phase 4.4 (step-4-phases.md): one shared component, used by the Stop
// sequence step (4.5) and, in Phase 5, the Discovery content modal (5.1),
// per constraints.md's Inventory Before Suggesting rule against near
// identical place vs business pickers. Searches and lists places and
// businesses where verification_status is verified, matching the
// public-facing verification bar and the same pattern
// admin-event-detail.tsx already uses for its single-table
// related_place_id picker, generalized here to both tables.

export type PickableLocationType = "place" | "business";

// latitude/longitude ride along so a caller that orders stops by distance (the
// personal trail builder, trail-builder.tsx) needs no second lookup. Null when
// the row has no geocoded address yet.
export interface PickedLocation {
  type: PickableLocationType;
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface PlaceRow {
  id: string;
  name: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
}

interface BusinessRow {
  id: string;
  name: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  pending: boolean;
}

interface PlaceBusinessPickerProps {
  onPick: (location: PickedLocation) => void;
  /** ids already used elsewhere (e.g. already added as a stop), hidden from results so the same row can't be picked twice. */
  excludeIds?: Set<string>;
  /**
   * Also list businesses still pending CATO review (migration 0015 makes them
   * public). Off by default: staff building an official trail want verified
   * rows only. Places have no public pending state, so this never affects them.
   */
  includePending?: boolean;
  /** ids (places and businesses) to list first with a "Saved" tag, so a person can pick from what they saved. */
  savedIds?: Set<string>;
  /** ids that hold a secret to unlock (locations_with_entries, 0055). Tagged "Has a secret" and listed right after the saved ones. */
  markedIds?: Set<string>;
  /**
   * "list" (default) is the dense scroll list the staff trail builder uses.
   * "cards" is the photo card grid the personal trail builder uses: six cards
   * at a time with a View more button, and a cover photo is read only for the
   * cards on screen.
   */
  variant?: "list" | "cards";
}

// Cards shown before View more, and added by each press. Six fills two
// columns and three columns evenly.
const CARD_PAGE_SIZE = 6;

interface PickerCardData {
  type: PickableLocationType;
  id: string;
  name: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  pending: boolean;
}

// Saved rows first, then rows with a secret, each group keeping its name order
// (Array.sort is stable).
function listFirst<T extends { id: string }>(rows: T[], savedIds?: Set<string>, markedIds?: Set<string>): T[] {
  if (!savedIds?.size && !markedIds?.size) return rows;
  const rank = (id: string) => (savedIds?.has(id) ? 2 : 0) + (markedIds?.has(id) ? 1 : 0);
  return [...rows].sort((a, b) => rank(b.id) - rank(a.id));
}

export function PlaceBusinessPicker({
  onPick,
  excludeIds,
  includePending = false,
  savedIds,
  markedIds,
  variant = "list",
}: Readonly<PlaceBusinessPickerProps>) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(CARD_PAGE_SIZE);
  const [places, setPlaces] = useState<PlaceRow[] | null>(null);
  const [businesses, setBusinesses] = useState<BusinessRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    // verification_status is 'verified' on both tables per 4.4, but the
    // allowed value sets differ (places: pending/verified/rejected,
    // businesses: pending/verified/unverified per 0003 and 0004's check
    // constraints), so this queries both tables directly rather than
    // trying to express one union query across them. Phase 1.4 (place-
    // category-directory-phases.md): places.category is now a joined
    // place_categories.name (migration 0022), flattened below.
    //
    // Category Directory Expansion, Phase 1.7: businesses.category is now
    // a joined business_categories.name (migration 0027, category_id
    // replaces the old plain text column), flattened the same way, same
    // pattern the places query above already uses for place_categories.
    //
    // includePending (personal trails): businesses may also be pending, the
    // same two statuses the Saved page and 0015's public read allow.
    const businessQuery = supabase
      .from("businesses")
      .select("id, name, latitude, longitude, verification_status, business_categories(name)");
    void Promise.all([
      supabase
        .from("places")
        .select("id, name, latitude, longitude, place_categories(name)")
        .eq("verification_status", "verified")
        .order("name", { ascending: true }),
      (includePending
        ? businessQuery.in("verification_status", ["verified", "pending"])
        : businessQuery.eq("verification_status", "verified")
      ).order("name", { ascending: true }),
    ]).then(([placesRes, businessesRes]) => {
      if (cancelled) return;
      const placeRows = (placesRes.data ?? []) as {
        id: string;
        name: string;
        latitude: number | null;
        longitude: number | null;
        place_categories: { name: string } | { name: string }[] | null;
      }[];
      setPlaces(
        placeRows.map(({ place_categories, ...p }) => ({
          ...p,
          category: readEmbeddedName(place_categories) ?? "",
        }))
      );
      const businessRows = (businessesRes.data ?? []) as {
        id: string;
        name: string;
        latitude: number | null;
        longitude: number | null;
        verification_status: string;
        business_categories: { name: string } | { name: string }[] | null;
      }[];
      setBusinesses(
        businessRows.map(({ business_categories, verification_status, ...b }) => ({
          ...b,
          category: readEmbeddedName(business_categories),
          pending: verification_status === "pending",
        }))
      );
    });

    return () => {
      cancelled = true;
    };
  }, [includePending]);

  const loading = places === null || businesses === null;
  const normalizedQuery = query.trim().toLowerCase();

  const filteredPlaces = listFirst(
    (places ?? []).filter(
      (p) => !excludeIds?.has(p.id) && (!normalizedQuery || p.name.toLowerCase().includes(normalizedQuery))
    ),
    savedIds,
    markedIds
  );
  const filteredBusinesses = listFirst(
    (businesses ?? []).filter(
      (b) => !excludeIds?.has(b.id) && (!normalizedQuery || b.name.toLowerCase().includes(normalizedQuery))
    ),
    savedIds,
    markedIds
  );

  const isEmpty = filteredPlaces.length === 0 && filteredBusinesses.length === 0;

  // Extracted from a nested ternary (loading ? ... : isEmpty ? ... : ...)
  // inline in the render below: three mutually exclusive states for the
  // results area (loading, empty, or the actual place/business rows).
  let pickerBody: ReactNode;
  if (loading) {
    pickerBody = <p className="text-sm text-muted-foreground">Loading…</p>;
  } else if (isEmpty) {
    pickerBody = (
      <EmptyState icon={MagnifyingGlass}>
        {includePending
          ? "Matching places and businesses will appear here."
          : "Matching verified places and businesses will appear here."}
      </EmptyState>
    );
  } else if (variant === "cards") {
    const cards: PickerCardData[] = [
      ...filteredPlaces.map((p) => ({ ...p, type: "place" as const, pending: false })),
      ...filteredBusinesses.map((b) => ({ ...b, type: "business" as const })),
    ];
    pickerBody = (
      <PickerCards
        cards={cards}
        visibleCount={visibleCount}
        savedIds={savedIds}
        markedIds={markedIds}
        onPick={onPick}
        onViewMore={() => setVisibleCount((n) => n + CARD_PAGE_SIZE)}
      />
    );
  } else {
    pickerBody = (
      <div className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
        {filteredPlaces.map((place) => (
          <PickerRow
            key={`place-${place.id}`}
            name={place.name}
            category={place.category}
            typeLabel="Place"
            saved={savedIds?.has(place.id) ?? false}
            hasSecret={markedIds?.has(place.id) ?? false}
            onClick={() =>
              onPick({
                type: "place",
                id: place.id,
                name: place.name,
                latitude: place.latitude,
                longitude: place.longitude,
              })
            }
          />
        ))}
        {filteredBusinesses.map((business) => (
          <PickerRow
            key={`business-${business.id}`}
            name={business.name}
            category={business.category}
            typeLabel="Business"
            saved={savedIds?.has(business.id) ?? false}
            hasSecret={markedIds?.has(business.id) ?? false}
            pending={business.pending}
            onClick={() =>
              onPick({
                type: "business",
                id: business.id,
                name: business.name,
                latitude: business.latitude,
                longitude: business.longitude,
              })
            }
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={includePending ? "Search places and businesses" : "Search verified places and businesses"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisibleCount(CARD_PAGE_SIZE);
          }}
          className="pl-9"
        />
      </div>

      {pickerBody}
    </div>
  );
}

function PickerRow({
  name,
  category,
  typeLabel,
  saved = false,
  hasSecret = false,
  pending = false,
  onClick,
}: Readonly<{
  name: string;
  category: string | null;
  typeLabel: string;
  saved?: boolean;
  hasSecret?: boolean;
  pending?: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-3 p-3 text-left hover:bg-muted"
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">{name}</span>
        {category && <span className="truncate text-xs text-muted-foreground">{category}</span>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {hasSecret && <Badge variant="default">Has a secret</Badge>}
        {saved && <Badge variant="accent">Saved</Badge>}
        {pending && <Badge variant="outline">Pending</Badge>}
        <Badge variant="secondary">{typeLabel}</Badge>
      </div>
    </button>
  );
}

// The photo card grid. Shows `visibleCount` cards and a View more button for
// the rest, so a long list of places never loads every cover photo at once: a
// photo is read only for the cards on screen, in one request per kind each time
// the visible set grows. A card the person picks leaves the list (excludeIds),
// so the next one slides up and the count of cards on screen stays the same.
function PickerCards({
  cards,
  visibleCount,
  savedIds,
  markedIds,
  onPick,
  onViewMore,
}: Readonly<{
  cards: PickerCardData[];
  visibleCount: number;
  savedIds?: Set<string>;
  markedIds?: Set<string>;
  onPick: (location: PickedLocation) => void;
  onViewMore: () => void;
}>) {
  const [covers, setCovers] = useState<Map<string, string>>(new Map());
  const requested = useRef(new Set<string>());
  // Not tied to the visible set: a read that is still running when the set
  // changes must still land, since its ids are already marked as requested.
  const mounted = useRef(true);
  const visible = cards.slice(0, visibleCount);
  // A string, so the effect below re-runs only when the cards on screen change.
  const visibleKey = visible.map((card) => `${card.type}:${card.id}`).join(",");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const fresh = visibleKey
      .split(",")
      .filter((key) => key && !requested.current.has(key))
      .map((key) => key.split(":"));
    if (fresh.length === 0) return;
    for (const [type, id] of fresh) requested.current.add(`${type}:${id}`);

    const idsOf = (kind: string) => fresh.filter(([type]) => type === kind).map(([, id]) => id);
    void Promise.all([
      fetchCoverPhotoUrls("place_photos", "place_id", idsOf("place")),
      fetchCoverPhotoUrls("business_photos", "business_id", idsOf("business")),
    ])
      .then(([placeCovers, businessCovers]) => {
        if (!mounted.current) return;
        setCovers((current) => new Map([...current, ...placeCovers, ...businessCovers]));
      })
      .catch(() => {
        // No photo on these cards. The card still works.
      });
  }, [visibleKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {visible.map((card) => (
          <PickerCard
            key={`${card.type}-${card.id}`}
            card={card}
            coverPhotoUrl={covers.get(card.id) ?? null}
            saved={savedIds?.has(card.id) ?? false}
            hasSecret={markedIds?.has(card.id) ?? false}
            onClick={() =>
              onPick({
                type: card.type,
                id: card.id,
                name: card.name,
                latitude: card.latitude,
                longitude: card.longitude,
              })
            }
          />
        ))}
      </div>
      {cards.length > visibleCount && (
        <Button type="button" variant="outline" className="self-center" onClick={onViewMore}>
          View more
        </Button>
      )}
    </div>
  );
}

// One whole-card button, so only spans sit inside it (a div in a button is not
// valid HTML, and the Badge component renders a div). The badges use
// badgeVariants for the same look. Type and category share one muted line, so
// the statuses are the only badges.
function PickerCard({
  card,
  coverPhotoUrl,
  saved,
  hasSecret,
  onClick,
}: Readonly<{
  card: PickerCardData;
  coverPhotoUrl: string | null;
  saved: boolean;
  hasSecret: boolean;
  onClick: () => void;
}>) {
  const typeLabel = card.type === "place" ? "Place" : "Business";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className="relative block aspect-square w-full shrink-0 bg-muted bg-cover bg-center"
        style={{ backgroundImage: coverPhotoUrl ? `url(${coverPhotoUrl})` : undefined }}
      >
        <PhotoCaptionOverlay name={card.name} />
      </span>
      <span className="flex flex-1 flex-col gap-1 p-2">
        <span className="truncate text-xs text-muted-foreground">
          {card.category ? `${typeLabel} · ${card.category}` : typeLabel}
        </span>
        {(hasSecret || saved || card.pending) && (
          <span className="flex flex-wrap gap-1">
            {hasSecret && <span className={badgeVariants({ variant: "default" })}>Has a secret</span>}
            {saved && <span className={badgeVariants({ variant: "accent" })}>Saved</span>}
            {card.pending && <span className={badgeVariants({ variant: "outline" })}>Pending</span>}
          </span>
        )}
      </span>
    </button>
  );
}
