import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowBendUpRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DirectionsError, fetchRoute } from "@/lib/directions";
import type { DiscoverResult } from "@/lib/discover-types";
import { useDirections } from "@/components/public/public-shell";
import { useOnline } from "@/lib/offline/status";
import { useMapPack } from "@/lib/offline/map-pack";
import { MAP_NEEDS_CONNECTION, NEEDS_CONNECTION } from "@/lib/offline/messages";

/**
 * Directions on a place or business's full detail page. The map preview
 * (result-card.tsx) had it; the full page did not, so opening "View" lost it.
 *
 * Same flow as the preview: fetch a walking route from the shell's `origin`
 * (a custom From, else the live location), hand it to the shell's
 * `handleRouteFound`, then go to /discover, where the map draws the line and
 * the directions panel opens. The Directions session lives in PublicShell
 * (#16), which these pages sit under, so it survives the navigation. The
 * panel's own mode buttons take it from there.
 *
 * No coordinates on the record: nothing to route to, so no button. No
 * origin: the button opens the panel, which asks for a starting point.
 */
export function PageDirectionsButton({ result }: Readonly<{ result: DiscoverResult }>) {
  const navigate = useNavigate();
  const { origin, handleRouteFound, handleOpenDirections } = useDirections();
  const online = useOnline();
  // The directions panel lives on the map, so with no connection it is only
  // reachable when a map is downloaded.
  const mapDownloaded = useMapPack().state === "downloaded";
  const mapReady = online || mapDownloaded;
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (result.latitude == null || result.longitude == null) return null;
  const destination = { latitude: result.latitude, longitude: result.longitude };

  if (!origin) {
    // No starting point: open the panel on the map and let the person choose one.
    return (
      <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={!mapReady}
        onClick={() => {
          handleOpenDirections(result);
          navigate("/discover");
        }}
      >
        Directions
        <ArrowBendUpRight weight="bold" className="h-4 w-4" aria-hidden="true" />
      </Button>
      {!mapReady && <p className="text-xs text-muted-foreground">{MAP_NEEDS_CONNECTION}</p>}
      </div>
    );
  }
  const start = origin;

  async function handleClick() {
    setStatus("loading");
    setError(null);
    try {
      const geometry = await fetchRoute(start, destination, "foot");
      setStatus("idle");
      handleRouteFound(geometry, result);
      navigate("/discover");
    } catch (err) {
      setStatus("error");
      setError(err instanceof DirectionsError ? err.message : "Couldn't reach the routing service, try again.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {status === "error" && error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={status === "loading" || !online}
        loading={status === "loading"}
        onClick={handleClick}
      >
        {status === "loading" ? "Getting directions…" : "Directions"}
        {status !== "loading" && <ArrowBendUpRight weight="bold" className="h-4 w-4" aria-hidden="true" />}
      </Button>
      {!online && <p className="text-xs text-muted-foreground">{NEEDS_CONNECTION}</p>}
    </div>
  );
}
