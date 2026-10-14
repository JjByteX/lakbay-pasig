import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bookmark, MapTrifold, Storefront, type Icon } from "@phosphor-icons/react";
import { fetchSavedPlaces } from "@/lib/saved-places";
import { fetchSavedBusinesses, type SavedBusiness } from "@/lib/saved-businesses";
import { fetchSavedRoutes } from "@/lib/saved-routes";
import { fetchCompletedRoutes } from "@/lib/trail-completion";
import type { DiscoverPlace } from "@/lib/discover-types";
import type { TrailSummary } from "@/lib/trail-types";
import { SavedPlaceRow } from "@/components/public/saved-place-row";
import { SavedTrailRow } from "@/components/public/saved-trail-row";
import { CompletedTrailRow } from "@/components/public/completed-trail-row";
import { PageContainer } from "@/components/public/page-container";
import { usePageTitle } from "@/lib/page-title";

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
 * Sign in button opens the auth popup via openAuth("login")
 * (landing-hero-phases.md 7.7), same as every other guest gate in the app
 * now (save-button.tsx, save-route-button.tsx, trail-detail.tsx's
 * handleStart) -- previously this was the one guest gate that used a real
 * navigation (Link to="/login") rather than a click handler, since its
 * only purpose was "go to /login." That distinction is gone now that
 * /login itself just opens the same popup: a guest lands back on this
 * page, signed in, instead of losing their place.
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

// Grids, not lists: Saved shows cards in the Home photo-card style. Places and
// Businesses are photo cards, two across on mobile and three at md+ (a photo
// tile needs the width). Trails and Completed are text-only cards, one across
// on mobile and three at md+. gap-4 is on the 8px grid. Each skeleton below
// matches its real card's proportions, so a loading grid and a loaded grid
// occupy about the same footprint.
const PHOTO_GRID = "grid grid-cols-2 gap-4 md:grid-cols-3";
const TEXT_GRID = "grid grid-cols-1 gap-4 md:grid-cols-3";

// Square photo plus the footer under it (category, badge, heart).
function PhotoGridSkeleton() {
  return (
    <div className={PHOTO_GRID}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="aspect-[4/5] rounded-lg" />
      ))}
    </div>
  );
}

// Name line and a meta line or two, inside a bordered card.
function TextGridSkeleton() {
  return (
    <div className={TEXT_GRID}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Phase 3: three independent sections, each with its own load/error/empty
 * state, same per-section independence home.tsx already establishes for
 * its two sections (a slow Saved Places query and a slow Completed Trails
 * query are unrelated causes). Section order top to bottom matches
 * step-8-plan.md's scope line exactly: Saved Places, Saved Trails,
 * Completed Trails.
 *
 * Segmented control: the sections sit behind one Places / Businesses / Trails
 * control (Businesses was added with migration 0047) (the same Tabs primitive
 * discover-place-detail.tsx uses for Details / History) instead of stacking,
 * so one grid shows at a time. Completed no longer has its own segment: a
 * completion log is not a saved list, and a fourth segment was a tight fit in
 * the 448px mobile column, so the Trails segment holds two groups, Saved and
 * Completed, each with its own load/error/empty state. Places and Businesses
 * need no heading, since the segment label is their title. Data still loads
 * once per page, so switching segments never refetches.
 */
// Phase 6-plus cleanup: the three sections below (Saved Places, Saved
// Trails, Completed Trails) all follow the exact same error/loading/empty/
// loaded order (this file's own established convention, re-confirmed as
// recently as Step 8 Phase 6.1's re-check pass). Extracted here as one
// shared section shell instead of three near-identical inline blocks --
// same output, same per-section skeleton and copy, just one place that
// owns the branching order instead of three.
function SavedSection({
  error,
  loading,
  skeleton,
  isEmpty,
  emptyIcon,
  emptyText,
  emptyAction,
  onRetry,
  children,
}: Readonly<{
  error: string | null;
  loading: boolean;
  skeleton: ReactNode;
  isEmpty: boolean;
  emptyIcon: Icon;
  emptyText: string;
  emptyAction?: ReactNode;
  onRetry: () => void;
  children: ReactNode;
}>) {
  let body: ReactNode;
  if (error) {
    body = <ErrorState onRetry={onRetry}>{error}</ErrorState>;
  } else if (loading) {
    body = skeleton;
  } else if (isEmpty) {
    body = (
      <EmptyState icon={emptyIcon} action={emptyAction}>
        {emptyText}
      </EmptyState>
    );
  } else {
    body = children;
  }

  return <>{body}</>;
}

// One titled group inside the Trails segment (Saved or Completed). Same
// error/loading/empty/loaded order as SavedSection, but an empty group is one
// muted line, not a full empty state, because the other group may have rows.
function TrailGroup({
  title,
  error,
  loading,
  count,
  emptyText,
  onRetry,
  children,
}: Readonly<{
  title: string;
  error: string | null;
  loading: boolean;
  count: number;
  emptyText: string;
  onRetry: () => void;
  children: ReactNode;
}>) {
  let body: ReactNode;
  if (error) {
    body = <ErrorState onRetry={onRetry}>{error}</ErrorState>;
  } else if (loading) {
    body = <TextGridSkeleton />;
  } else if (count === 0) {
    body = <p className="text-sm text-muted-foreground">{emptyText}</p>;
  } else {
    body = children;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {body}
    </section>
  );
}

export default function SavedPage() {
  usePageTitle("Saved");
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { openAuth } = useAuthModal();

  const [places, setPlaces] = useState<DiscoverPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [placesError, setPlacesError] = useState<string | null>(null);

  // Businesses (saved_businesses, migration 0047): the same row as a place,
  // its own list and its own load/error/empty state.
  const [businesses, setBusinesses] = useState<SavedBusiness[]>([]);
  const [businessesLoading, setBusinessesLoading] = useState(true);
  const [businessesError, setBusinessesError] = useState<string | null>(null);

  const [trails, setTrails] = useState<TrailSummary[]>([]);
  const [trailsLoading, setTrailsLoading] = useState(true);
  const [trailsError, setTrailsError] = useState<string | null>(null);

  const [completed, setCompleted] = useState<(TrailSummary & { completed_at: string })[]>([]);
  const [completedLoading, setCompletedLoading] = useState(true);
  const [completedError, setCompletedError] = useState<string | null>(null);

  // "Try again" on a section's error bumps its counter, which re-runs only that
  // section's load effect.
  const [retry, setRetry] = useState({ places: 0, businesses: 0, trails: 0, completed: 0 });
  const bump = (key: keyof typeof retry) => setRetry((r) => ({ ...r, [key]: r[key] + 1 }));

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
      .catch(() => {
        setPlacesError("Couldn't load your saved places. Check your connection and try again.");
        setPlaces([]);
      })
      .finally(() => setPlacesLoading(false));
  }, [session, retry.places]);

  useEffect(() => {
    if (!session) return;
    setBusinessesLoading(true);
    setBusinessesError(null);
    fetchSavedBusinesses(session.user.id)
      .then(setBusinesses)
      .catch(() => {
        setBusinessesError("Couldn't load your saved businesses. Check your connection and try again.");
        setBusinesses([]);
      })
      .finally(() => setBusinessesLoading(false));
  }, [session, retry.businesses]);

  useEffect(() => {
    if (!session) return;
    setTrailsLoading(true);
    setTrailsError(null);
    fetchSavedRoutes(session.user.id)
      .then(setTrails)
      .catch(() => {
        setTrailsError("Couldn't load your saved trails. Check your connection and try again.");
        setTrails([]);
      })
      .finally(() => setTrailsLoading(false));
  }, [session, retry.trails]);

  useEffect(() => {
    if (!session) return;
    setCompletedLoading(true);
    setCompletedError(null);
    fetchCompletedRoutes(session.user.id)
      .then(setCompleted)
      .catch(() => {
        setCompletedError("Couldn't load your completed trails. Check your connection and try again.");
        setCompleted([]);
      })
      .finally(() => setCompletedLoading(false));
  }, [session, retry.completed]);

  if (loading) return null;

  // Both trail groups finished loading, neither failed, both empty: one empty
  // state for the whole segment instead of two empty lines.
  const noTrailsAtAll =
    !trailsLoading && !completedLoading && !trailsError && !completedError && trails.length === 0 && completed.length === 0;

  if (!session) {
    return (
      <PageContainer width="wide" className="items-start gap-4 py-10">
        <h1 className="text-xl font-semibold text-foreground">Saved</h1>
        <p className="text-base text-muted-foreground">
          Sign in to see your saved places, saved businesses, saved trails, and completed trails.
        </p>
        <Button onClick={() => openAuth("login")}>Sign in</Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <h1 className="text-xl font-semibold text-foreground">Saved</h1>

      <Tabs defaultValue="places">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="places">Places</TabsTrigger>
          <TabsTrigger value="businesses">Businesses</TabsTrigger>
          <TabsTrigger value="trails">Trails</TabsTrigger>
        </TabsList>

        <TabsContent value="places">
          <SavedSection
            error={placesError}
            onRetry={() => bump("places")}
            loading={placesLoading}
            skeleton={<PhotoGridSkeleton />}
            isEmpty={places.length === 0}
            emptyIcon={Bookmark}
            emptyText="Saved places will appear here."
            emptyAction={
              <Button variant="outline" onClick={() => navigate("/discover")}>
                Browse places
              </Button>
            }
          >
            <ul className={PHOTO_GRID}>
              {places.map((place) => (
                <li key={place.id} className="min-w-0">
                  <SavedPlaceRow
                    place={place}
                    onClick={() => navigate(`/discover/place/${place.id}`)}
                    onUnsave={() => setPlaces((prev) => prev.filter((p) => p.id !== place.id))}
                  />
                </li>
              ))}
            </ul>
          </SavedSection>
        </TabsContent>

        <TabsContent value="businesses">
          <SavedSection
            error={businessesError}
            onRetry={() => bump("businesses")}
            loading={businessesLoading}
            skeleton={<PhotoGridSkeleton />}
            isEmpty={businesses.length === 0}
            emptyIcon={Storefront}
            emptyText="Saved businesses will appear here."
            emptyAction={
              <Button variant="outline" onClick={() => navigate("/discover")}>
                Browse businesses
              </Button>
            }
          >
            <ul className={PHOTO_GRID}>
              {businesses.map((business) => (
                <li key={business.id} className="min-w-0">
                  <SavedPlaceRow
                    place={business}
                    kind="business"
                    onClick={() => navigate(`/discover/business/${business.id}`)}
                    onUnsave={() => setBusinesses((prev) => prev.filter((b) => b.id !== business.id))}
                  />
                </li>
              ))}
            </ul>
          </SavedSection>
        </TabsContent>

        <TabsContent value="trails">
          {noTrailsAtAll ? (
            <EmptyState
              icon={MapTrifold}
              action={
                <Button variant="outline" onClick={() => navigate("/trails")}>
                  Find a trail
                </Button>
              }
            >
              Saved and completed trails will appear here.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              <TrailGroup
                title="Saved"
                error={trailsError}
                onRetry={() => bump("trails")}
                loading={trailsLoading}
                count={trails.length}
                emptyText="No saved trails yet."
              >
                <ul className={TEXT_GRID}>
                  {trails.map((trail) => (
                    <li key={trail.id} className="min-w-0">
                      <SavedTrailRow
                        trail={trail}
                        onClick={() => navigate(`/trails/${trail.id}`)}
                        onUnsave={() => setTrails((prev) => prev.filter((t) => t.id !== trail.id))}
                      />
                    </li>
                  ))}
                </ul>
              </TrailGroup>

              <TrailGroup
                title="Completed"
                error={completedError}
                onRetry={() => bump("completed")}
                loading={completedLoading}
                count={completed.length}
                emptyText="No completed trails yet."
              >
                <ul className={TEXT_GRID}>
                  {completed.map((trail) => (
                    <li key={trail.id} className="min-w-0">
                      <CompletedTrailRow trail={trail} onClick={() => navigate(`/trails/${trail.id}`)} />
                    </li>
                  ))}
                </ul>
              </TrailGroup>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
