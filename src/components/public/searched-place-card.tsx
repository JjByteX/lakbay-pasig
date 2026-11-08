import { useEffect, useState } from "react";
import { ArrowBendUpRight, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DirectionsError, fetchRoute } from "@/lib/directions";
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

function standInResult(place: SearchedPlace): DiscoverBusiness {
  return {
    kind: "business",
    id: `map:${place.coordinates.latitude},${place.coordinates.longitude}`,
    name: place.name,
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
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // A different place starts clean, same as the result card.
  useEffect(() => {
    setStatus("idle");
    setError(null);
  }, [place]);

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
    onRouteFound(geometry, standInResult(place));
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] p-3">
      <div className="pointer-events-auto mx-auto flex w-full max-w-md items-start justify-between gap-4 rounded-2xl border border-input bg-card p-4 shadow">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{place.name}</p>
          {place.address && <p className="truncate text-sm text-muted-foreground">{place.address}</p>}
          {status === "error" && error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          {!userLocation && (
            <p className="mt-1 text-xs text-muted-foreground">Turn on location to get directions</p>
          )}
          {!online && <p className="mt-1 text-xs text-muted-foreground">{NEEDS_CONNECTION}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {userLocation && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 gap-2"
              disabled={status === "loading" || !online}
              loading={status === "loading"}
              onClick={() => void handleDirections()}
            >
              {status === "loading" ? "Getting directions…" : "Directions"}
              {status !== "loading" && <ArrowBendUpRight weight="bold" className="h-4 w-4" aria-hidden="true" />}
            </Button>
          )}
          <button
            type="button"
            aria-label="Clear place"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
