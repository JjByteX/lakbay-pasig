import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Phase 4.4 (step-4-phases.md): one shared component, used by the Stop
// sequence step (4.5) and, in Phase 5, the Discovery content modal (5.1),
// per constraints.md's Inventory Before Suggesting rule against near
// identical place vs business pickers. Searches and lists places and
// businesses where verification_status is verified, matching the
// public-facing verification bar and the same pattern
// admin-event-detail.tsx already uses for its single-table
// related_place_id picker, generalized here to both tables.

export type PickableLocationType = "place" | "business";

export interface PickedLocation {
  type: PickableLocationType;
  id: string;
  name: string;
}

interface PlaceRow {
  id: string;
  name: string;
  category: string;
}

interface BusinessRow {
  id: string;
  name: string;
  category: string | null;
}

interface PlaceBusinessPickerProps {
  onPick: (location: PickedLocation) => void;
  /** ids already used elsewhere (e.g. already added as a stop), hidden from results so the same row can't be picked twice. */
  excludeIds?: Set<string>;
}

export function PlaceBusinessPicker({ onPick, excludeIds }: PlaceBusinessPickerProps) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceRow[] | null>(null);
  const [businesses, setBusinesses] = useState<BusinessRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    // verification_status is 'verified' on both tables per 4.4, but the
    // allowed value sets differ (places: pending/verified/rejected,
    // businesses: pending/verified/unverified per 0003 and 0004's check
    // constraints), so this queries both tables directly rather than
    // trying to express one union query across them.
    Promise.all([
      supabase
        .from("places")
        .select("id, name, category")
        .eq("verification_status", "verified")
        .order("name", { ascending: true }),
      supabase
        .from("businesses")
        .select("id, name, category")
        .eq("verification_status", "verified")
        .order("name", { ascending: true }),
    ]).then(([placesRes, businessesRes]) => {
      if (cancelled) return;
      setPlaces((placesRes.data ?? []) as PlaceRow[]);
      setBusinesses((businessesRes.data ?? []) as BusinessRow[]);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const loading = places === null || businesses === null;
  const normalizedQuery = query.trim().toLowerCase();

  const filteredPlaces = (places ?? []).filter(
    (p) => !excludeIds?.has(p.id) && (!normalizedQuery || p.name.toLowerCase().includes(normalizedQuery))
  );
  const filteredBusinesses = (businesses ?? []).filter(
    (b) => !excludeIds?.has(b.id) && (!normalizedQuery || b.name.toLowerCase().includes(normalizedQuery))
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search verified places and businesses"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filteredPlaces.length === 0 && filteredBusinesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No verified places or businesses match.</p>
      ) : (
        <div className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
          {filteredPlaces.map((place) => (
            <PickerRow
              key={`place-${place.id}`}
              name={place.name}
              category={place.category}
              typeLabel="Place"
              onClick={() => onPick({ type: "place", id: place.id, name: place.name })}
            />
          ))}
          {filteredBusinesses.map((business) => (
            <PickerRow
              key={`business-${business.id}`}
              name={business.name}
              category={business.category}
              typeLabel="Business"
              onClick={() => onPick({ type: "business", id: business.id, name: business.name })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PickerRow({
  name,
  category,
  typeLabel,
  onClick,
}: {
  name: string;
  category: string | null;
  typeLabel: string;
  onClick: () => void;
}) {
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
      <Badge variant="secondary" className="shrink-0">
        {typeLabel}
      </Badge>
    </button>
  );
}
