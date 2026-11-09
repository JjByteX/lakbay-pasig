import { useEffect, useState } from "react";
import { ArrowBendUpRight, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DirectionsError, fetchRoute } from "@/lib/directions";
import { reverseGeocode } from "@/lib/geocode";
import { useDirections } from "./public-shell";
import type { Coordinates } from "@/lib/discover-query";
import type { DiscoverBusiness, DiscoverResult } from "@/lib/discover-types";
import { useOnline } from "@/lib/offline/status";
import { NEEDS_CONNECTION } from "@/lib/offline/messages";
import type { RouteGeometry } from "@/lib/directions";
import type { SearchedPlace } from "./public-shell";

// Card for a street or landmark picked from the search ("On the map"). The
// pin alone gave no name, no way to get there and no way to dismiss it, so this
// sits at the bottom of the Discover map with the name, the address, a
// Directions button and a close X.
//
// Directions reuses the same flow as a result card: a walking route from the
// live position, handed to the shell, which opens the directions panel. The
// panel only reads the destination's name and coordinates, so a stand-in
// result carrying those is enough; it is never saved or linked anywhere.

interface SearchedPlaceCardProps {
  place: SearchedPlace;
  userLocation: Coordinates | null;
  onRouteFound: (geometry: RouteGeometry, result: DiscoverResult) => void;
  onClose: () => void;
}

function standInResult(place: SearchedPlace, label: string): DiscoverBusiness {
  return {
    kind: "business",
    id: `map:${place.coordinates.latitude},${place.coordinates.longitude}`,
    name: label,
    category: null,
    categoryIcon: null,
    categoryColor: null,
    description: null,
    latitude: place.coordinates.latitude,
    longitude: place.coordinates.longitude,
    verification_status: "pending",
    items: [],
    coverPhotoUrl: null,
  };
}

export function SearchedPlaceCard({ place, userLocation, onRouteFound, onClose }: Readonly<SearchedPlaceCardProps>) {
  const online = useOnline();
  const { handleOpenDirections } = useDirections();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  // A dropped pin starts with its coordinates as the address line; the street
  // address replaces them when the lookup finds one. No result, offline or a
  // failed lookup leave the coordinates in place.
  const [foundAddress, setFoundAddress] = useState<string | null>(null);

  // A different place starts clean, same as the result card.
  useEffect(() => {
    setStatus("idle");
    setError(null);
  }, [place]);

  useEffect(() => {
    setFoundAddress(null);
    if (!place.dropped || !online) return;
    let cancelled = false;
    reverseGeocode(place.coordinates)
      .then((address) => {
        if (!cancelled) setFoundAddress(address);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [place, online]);

  // A dropped pin has no name worth showing (the person just placed it), so
  // the street address, or the coordinates until it is found, leads the card.
  // A searched street or landmark keeps its name with the address beneath.
  const address = foundAddress ?? place.address;
  const title = place.dropped ? (address ?? "Pinned location") : place.name;
  const subtitle = place.dropped ? null : address;

  async function handleDirections() {
    if (!userLocation) return;
    setStatus("loading");
    setError(null);
    let geometry: RouteGeometry;
    try {
      geometry = await fetchRoute(userLocation, place.coordinates, "foot");
    } catch (err) {
      setStatus("error");
      setError(err instanceof DirectionsError ? err.message : "Couldn't reach the routing service, try again.");
      return;
    }
    setStatus("idle");
    onRouteFound(geometry, standInResult(place, title));
  }

  const directionsLabel = status === "loading" ? "Getting directions…" : "Directions";
  const directionsIcon =
    status !== "loading" && <ArrowBendUpRight weight="bold" className="h-4 w-4" aria-hidden="true" />;

  // Title row on top (with the close button where cards put it), the one
  // action on its own full-width row beneath, so neither is squeezed.
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] p-3">
      <div className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-input bg-card p-4 shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-base font-semibold text-foreground">{title}</p>
            {subtitle && <p className="line-clamp-2 break-words text-sm text-muted-foreground">{subtitle}</p>}
            {status === "error" && error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            {!online && <p className="mt-1 text-xs text-muted-foreground">{NEEDS_CONNECTION}</p>}
          </div>
          <button
            type="button"
            aria-label="Clear place"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {userLocation ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 w-full gap-2"
            disabled={status === "loading" || !online}
            loading={status === "loading"}
            onClick={() => void handleDirections()}
          >
            {directionsLabel}
            {directionsIcon}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 w-full gap-2"
            onClick={() => handleOpenDirections(standInResult(place, title))}
          >
            Directions
            <ArrowBendUpRight weight="bold" className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
