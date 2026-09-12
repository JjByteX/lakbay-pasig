import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSavedPlaces } from "@/lib/saved-places";
import { fetchSavedRoutes } from "@/lib/saved-routes";
import { fetchCompletedRoutes } from "@/lib/trail-completion";
import type { DiscoverPlace } from "@/lib/discover-types";
import type { TrailSummary } from "@/lib/trail-types";
import { SavedPlaceRow } from "@/components/public/saved-place-row";
import { SavedTrailRow } from "@/components/public/saved-trail-row";
import { CompletedTrailRow } from "@/components/public/completed-trail-row";

/**
 * Step 8, Phase 2.1: guest locked state. saved.tsx carries no
 * ProtectedRoute (App.tsx), unlike ProtectedRoute's own behavior
 * (protected-route.tsx) of redirecting away entirely -- navigation-and-
 * access-control.md's Guest column says Saved is "locked, prompt to sign
 * in," not "redirected elsewhere," so a guest has to actually land on
 * this route and see the message, which ProtectedRoute doesn't allow.
 *
 * `loading` guard matches protected-route.tsx's own `if (loading) return
 * null` -- session starts null even for an already-signed-in user until
 * auth-context.tsx's initial getSession() resolves, so this page must not
 * render the guest message and then flash to the real content a moment
 * later.
 *
 * Sign in button is a real navigation action, not a save/start control
 * with a conditional redirect branch (contrast save-button.tsx,
 * save-route-button.tsx, trail-detail.tsx's handleStart, which all use
 * navigate("/login") inside a click handler for something else). Its only
 * purpose here is "go to /login," matching home.tsx's own Log in button
 * and signup.tsx's sign-in links, all of which use Link rather than a
 * programmatic navigate for the same reason. Button asChild + Link
 * follows result-card.tsx's own established composition for this exact
 * pairing, not a new pattern.
 *
 * No disabled control anywhere on this branch, per ux-ui-guidelines.md's
 * Disabled/gated rule (a disabled action must clearly communicate what
 * unlocks it) and this codebase's existing guest-state convention
 * (save-button.tsx's own comment makes the same call for the same reason).
 */

// Phase 3.5/6.1 shared with home.tsx and trails.tsx's own copies: same
// PostgrestError shape-check (a plain object with a .message field, not
// an Error subclass). Kept as a local copy rather than a new shared
// module, matching trails.tsx's own choice not to import home.tsx's
// page-local version, per constraints.md's Inventory Before Suggesting
// rule -- there is no existing shared helper for this, only two
// page-local copies already.
function errorMessageFrom(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string"
    ? err.message
    : fallback;
}

// Phase 6.2 fix: two-line row skeleton, matching trails.tsx's
// TrailListSkeleton shape (name line + one metadata line). Correct for
// Saved Trails and Completed Trails, whose real rows wrap trail-card.tsx's
// two-line shape. Saved Places is NOT this shape -- SavedPlaceRow renders
// name, category, AND a VerificationBadge, the same three-line shape as
// verified-item-card.tsx's row, which home.tsx's own SectionSkeleton
// already gives three skeleton lines for that exact reason. This function
// was previously shared across all three sections at two lines, silently
// under-representing Saved Places' real row. Split into two skeletons
// instead, one per real row shape, rather than padding every section to
// three and over-representing Saved/Completed Trails' true two-line rows.
function TwoLineSectionSkeleton() {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex flex-col gap-1 px-6 py-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}

function ThreeLineSectionSkeleton() {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex flex-col gap-1 px-6 py-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-20" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Phase 3: three independent sections, each with its own load/error/empty
 * state, same per-section independence home.tsx already establishes for
 * its two sections (a slow Saved Places query and a slow Completed Trails
 * query are unrelated causes). Section order top to bottom matches
 * step-8-plan.md's scope line exactly: Saved Places, Saved Trails,
 * Completed Trails.
 */
// Phase 6-plus cleanup: the three sections below (Saved Places, Saved
// Trails, Completed Trails) all follow the exact same error/loading/empty/
// loaded order (this file's own established convention, re-confirmed as
// recently as Step 8 Phase 6.1's re-check pass). Extracted here as one
// shared section shell instead of three near-identical inline blocks --
// same output, same per-section skeleton and copy, just one place that
// owns the branching order instead of three.
function SavedSection({
  title,
  error,
  loading,
  skeleton,
  isEmpty,
  emptyText,
  children,
}: Readonly<{
  title: string;
  error: string | null;
  loading: boolean;
  skeleton: ReactNode;
  isEmpty: boolean;
  emptyText: string;
  children: ReactNode;
}>) {
  let body: ReactNode;
  if (error) {
    body = <p className="text-sm text-destructive">{error}</p>;
  } else if (loading) {
    body = skeleton;
  } else if (isEmpty) {
    body = <p className="text-sm text-muted-foreground">{emptyText}</p>;
  } else {
    body = children;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {body}
    </div>
  );
}

export default function SavedPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  const [places, setPlaces] = useState<DiscoverPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [placesError, setPlacesError] = useState<string | null>(null);

  const [trails, setTrails] = useState<TrailSummary[]>([]);
  const [trailsLoading, setTrailsLoading] = useState(true);
  const [trailsError, setTrailsError] = useState<string | null>(null);

  const [completed, setCompleted] = useState<(TrailSummary & { completed_at: string })[]>([]);
  const [completedLoading, setCompletedLoading] = useState(true);
  const [completedError, setCompletedError] = useState<string | null>(null);

  // Phase 2.4: signed-out users never reach this hook's fetches, App.tsx
  // renders the guest branch below before this component's body's second
  // half runs -- these effects are declared unconditionally (rules of
  // hooks) but each guards on `session` internally the same way
  // save-button.tsx's own isPlaceSaved effect does, so a Guest never fires
  // a request that saved_places_own/saved_routes_own/completed_routes_own
  // would reject anyway.
  useEffect(() => {
    if (!session) return;
    setPlacesLoading(true);
    setPlacesError(null);
    fetchSavedPlaces(session.user.id)
      .then(setPlaces)
      .catch((err: unknown) => {
        setPlacesError(errorMessageFrom(err, "Could not load saved places."));
        setPlaces([]);
      })
      .finally(() => setPlacesLoading(false));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setTrailsLoading(true);
    setTrailsError(null);
    fetchSavedRoutes(session.user.id)
      .then(setTrails)
      .catch((err: unknown) => {
        setTrailsError(errorMessageFrom(err, "Could not load saved trails."));
        setTrails([]);
      })
      .finally(() => setTrailsLoading(false));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setCompletedLoading(true);
    setCompletedError(null);
    fetchCompletedRoutes(session.user.id)
      .then(setCompleted)
      .catch((err: unknown) => {
        setCompletedError(errorMessageFrom(err, "Could not load completed trails."));
        setCompleted([]);
      })
      .finally(() => setCompletedLoading(false));
  }, [session]);

  if (loading) return null;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground">Saved</h1>
        <p className="text-base text-muted-foreground">
          Sign in to see your saved places, saved trails, and completed trails.
        </p>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <h1 className="text-xl font-semibold text-foreground">Saved</h1>

      <SavedSection
        title="Saved Places"
        error={placesError}
        loading={placesLoading}
        skeleton={<ThreeLineSectionSkeleton />}
        isEmpty={places.length === 0}
        emptyText="No saved places yet."
      >
        <ul className="-mx-6 flex flex-col divide-y divide-border">
          {places.map((place) => (
            <li key={place.id}>
              <SavedPlaceRow
                place={place}
                onClick={() => navigate(`/discover/place/${place.id}`)}
                onUnsave={() => setPlaces((prev) => prev.filter((p) => p.id !== place.id))}
              />
            </li>
          ))}
        </ul>
      </SavedSection>

      <SavedSection
        title="Saved Trails"
        error={trailsError}
        loading={trailsLoading}
        skeleton={<TwoLineSectionSkeleton />}
        isEmpty={trails.length === 0}
        emptyText="No saved trails yet."
      >
        <ul className="-mx-6 flex flex-col divide-y divide-border">
          {trails.map((trail) => (
            <li key={trail.id}>
              <SavedTrailRow
                trail={trail}
                onClick={() => navigate(`/trails/${trail.id}`)}
                onUnsave={() => setTrails((prev) => prev.filter((t) => t.id !== trail.id))}
              />
            </li>
          ))}
        </ul>
      </SavedSection>

      <SavedSection
        title="Completed Trails"
        error={completedError}
        loading={completedLoading}
        skeleton={<TwoLineSectionSkeleton />}
        isEmpty={completed.length === 0}
        emptyText="No completed trails yet."
      >
        <ul className="-mx-6 flex flex-col divide-y divide-border">
          {completed.map((trail) => (
            <li key={trail.id}>
              <CompletedTrailRow trail={trail} onClick={() => navigate(`/trails/${trail.id}`)} />
            </li>
          ))}
        </ul>
      </SavedSection>
    </div>
  );
}
