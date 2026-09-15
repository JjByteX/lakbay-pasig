import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Coordinates } from "@/lib/discover-query";
import type { DiscoverResult } from "@/lib/discover-types";
import { DirectionsError, fetchWalkingRoute, type RouteGeometry } from "@/lib/directions";

// Phase 6.1 (step-5-phases.md), pulled forward because Phase 4.4 requires
// it to exist: "the same result card component Phase 6 defines." Scoped
// here to exactly what 4.4 needs to open on a marker tap: name, category,
// and the verification label. Full record fields (6.3-6.4: description,
// hours, item list, etc.) live on the separate detail route (6.2) this
// modal links out to below, not duplicated into the preview itself.
//
// Verification label per navigation-and-access-control.md's v1 scope:
// "Verified by Pasig Tourism Office" only, no named contributor credit.
// Pending business gets a visually distinct "Pending Verification" badge,
// per vendor-mode-spec.md, so an unreviewed listing never borrows the look
// of institutional trust it has not earned yet. Badge variant mapping
// reuses admin-places.tsx's STATUS_VARIANT convention (verified: default,
// pending: outline) for the same visual meaning across staff and public
// surfaces, rather than inventing a new pair of tokens.
// Exported since Phase 5.2: list rows need the identical badge treatment
// per step-5-plan.md's "every result card shows a verification label,"
// reused here rather than a second copy of the same status-to-label
// mapping, per constraints.md's Inventory Before Suggesting rule.
export function VerificationBadge({ status }: Readonly<{ status: DiscoverResult["verification_status"] }>) {
  if (status === "pending") {
    return <Badge variant="outline">Pending Verification</Badge>;
  }
  return <Badge variant="default">Verified by Pasig Tourism Office</Badge>;
}

interface ResultCardProps {
  result: DiscoverResult | null;
  onOpenChange: (open: boolean) => void;
  // locate-me-and-directions-phases.md Phase 3: origin for the Directions
  // fetch. Same userLocation prop discover-map.tsx already receives from
  // discover.tsx, passed straight through -- no second geolocation call,
  // per the plan's own "confirm userLocation stays single-sourced" check.
  userLocation: Coordinates | null;
  // Called with the route geometry on a successful fetch. discover-map.tsx
  // owns the actual map instance and the GeoJSON source/line-layer draw,
  // so this card only fetches and hands the result up, per constraints.md's
  // "map in one place" ownership -- this component has no map reference of
  // its own to draw onto.
  onRouteFound: (geometry: RouteGeometry) => void;
}

/**
 * Modal preview opened from a marker tap (Phase 4.4) or a list row tap
 * (Phase 5.2). Centered modal per ux-ui-guidelines.md's modal-vs-panel
 * rule: a focused preview that fits comfortably in a single viewport, not
 * a side panel.
 *
 * Phase 6.2 closes the loop this card left open: "View full details" links
 * to the dedicated detail route (discover-place-detail.tsx / discover-
 * business-detail.tsx, App.tsx's discover/place/:id and discover/
 * business/:id), branching on the same `kind` discriminator Phase 3.2
 * defined for exactly this. `asChild` on the Button lets react-router-
 * dom's Link own the actual anchor element instead of nesting an anchor
 * inside a button, matching the pattern already used for row actions
 * elsewhere in this codebase (e.g. admin-trails.tsx's Link-based row
 * links). Link variant, not default, since this is a secondary
 * navigation action inside a preview, not the modal's primary action.
 *
 * locate-me-and-directions-phases.md Phase 3: adds a Directions button
 * beside "View full details." Disabled with a visible reason when
 * userLocation is null (admin-event-detail.tsx's publish-gate pattern,
 * same Disabled/gated shape per ux-ui-guidelines.md). Loading and error
 * state are local to this card, not lifted -- they're ephemeral to one
 * button press and nothing else in the app reads them. On success, hands
 * the route geometry up via onRouteFound and closes the popup itself
 * (onOpenChange(false)) so the drawn line is visible, per the plan's own
 * "close or minimize the popup so the line is visible."
 */
export function ResultCard({ result, onOpenChange, userLocation, onRouteFound }: Readonly<ResultCardProps>) {
  const [directionsStatus, setDirectionsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [directionsError, setDirectionsError] = useState<string | null>(null);

  // Phase 3.7: reset whenever a different result opens, so a stale error
  // or spinner from a previous popup never bleeds into the next one.
  useEffect(() => {
    setDirectionsStatus("idle");
    setDirectionsError(null);
  }, [result]);

  const handleDirections = async () => {
    if (!result || !userLocation || result.latitude == null || result.longitude == null) return;
    setDirectionsStatus("loading");
    setDirectionsError(null);
    let geometry: RouteGeometry;
    try {
      geometry = await fetchWalkingRoute(userLocation, {
        latitude: result.latitude,
        longitude: result.longitude,
      });
    } catch (err) {
      setDirectionsStatus("error");
      setDirectionsError(
        err instanceof DirectionsError ? err.message : "Couldn't reach the routing service, try again.",
      );
      return;
    }
    // Outside the fetch's try/catch on purpose: the route was found either
    // way, so a draw-side issue (map not mounted, style mid-swap) must
    // never surface as a misleading "couldn't reach the routing service"
    // message. discover-map.tsx's drawRoute already guards its own
    // not-ready case internally and re-draws on the next style.load.
    setDirectionsStatus("idle");
    onOpenChange(false);
    onRouteFound(geometry);
  };

  return (
    <Dialog open={result !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {result && (
          <>
            <DialogHeader>
              <DialogTitle>{result.name}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{result.category}</p>
              {result.description && (
                <p className="text-base text-foreground">{result.description}</p>
              )}
              <VerificationBadge status={result.verification_status} />
            </div>
            <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button asChild variant="link" className="px-0">
                <Link to={`/discover/${result.kind}/${result.id}`} onClick={() => onOpenChange(false)}>
                  View full details
                </Link>
              </Button>
              <div className="flex flex-col items-end gap-1">
                {/* 3.2: visible reason, not a silently dead button, per
                    ux-ui-guidelines.md's Disabled/gated rule. */}
                {!userLocation && (
                  <p className="text-xs text-muted-foreground">Turn on location to get directions</p>
                )}
                {directionsStatus === "error" && directionsError && (
                  <p className="text-xs text-destructive">{directionsError}</p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!userLocation || directionsStatus === "loading"}
                  onClick={handleDirections}
                >
                  {directionsStatus === "loading" ? "Getting directions…" : "Directions"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
