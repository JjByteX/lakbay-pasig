import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bookmark, CheckCircle, MapTrifold, Storefront, type Icon } from "@phosphor-icons/react";
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
// `inline` mirrors trails.tsx's TrailListSkeleton at md+ (one line, name left,
// meta right) for Saved Trails, whose real row is TrailCard inline. Completed
// Trails keeps its second line (date + credential) at md, so it stays stacked.
function TwoLineSectionSkeleton({ inline = false }: Readonly<{ inline?: boolean }>) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className={
            inline
              ? "flex flex-col gap-1 px-6 py-4 md:flex-row md:items-center md:justify-between"
              : "flex flex-col gap-1 px-6 py-4"
          }
        >
          <Skeleton className={inline ? "h-4 w-2/3 md:w-1/3" : "h-4 w-2/3"} />
          <Skeleton className={inline ? "h-3 w-1/3 md:w-1/6" : "h-3 w-1/3"} />
        </li>
      ))}
    </ul>
  );
}

function ThreeLineSectionSkeleton() {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex flex-col gap-1 px-6 py-4 md:grid md:grid-cols-[1fr_12rem_auto] md:items-center md:gap-6"
        >
          <Skeleton className="h-4 w-2/3 md:w-1/2" />
          <Skeleton className="h-3 w-1/3 md:w-1/2" />
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
 *
 * Segmented control: the sections now sit behind one Places / Businesses /
 * Trails / Completed control (Businesses was added with migration 0047) (the same Tabs primitive discover-place-detail.tsx uses
 * for Details / History) instead of stacking, so one list shows at a time.
 * The segment label is each section's title, so the old h2 headings are
 * gone (ux-ui-guidelines.md: one label per concept, and the page title
 * already says Saved). The short labels also fit three across the 448px
 * mobile column, where Completed Trails would not. Data still loads once
 * per page, so switching segments never refetches.
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
  children,
}: Readonly<{
  error: string | null;
  loading: boolean;
  skeleton: ReactNode;
  isEmpty: boolean;
  emptyIcon: Icon;
  emptyText: string;
  children: ReactNode;
}>) {
  let body: ReactNode;
  if (error) {
    body = <p className="text-sm text-destructive">{error}</p>;
  } else if (loading) {
    body = skeleton;
  } else if (isEmpty) {
    body = <EmptyState icon={emptyIcon}>{emptyText}</EmptyState>;
  } else {
    body = children;
  }

  return <>{body}</>;
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
    setBusinessesLoading(true);
    setBusinessesError(null);
    fetchSavedBusinesses(session.user.id)
      .then(setBusinesses)
      .catch((err: unknown) => {
        setBusinessesError(errorMessageFrom(err, "Could not load saved businesses."));
        setBusinesses([]);
      })
      .finally(() => setBusinessesLoading(false));
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="places">Places</TabsTrigger>
          <TabsTrigger value="businesses">Businesses</TabsTrigger>
          <TabsTrigger value="trails">Trails</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="places">
          <SavedSection
            error={placesError}
            loading={placesLoading}
            skeleton={<ThreeLineSectionSkeleton />}
            isEmpty={places.length === 0}
            emptyIcon={Bookmark}
            emptyText="Saved places will appear here."
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
        </TabsContent>

        <TabsContent value="businesses">
          <SavedSection
            error={businessesError}
            loading={businessesLoading}
            skeleton={<ThreeLineSectionSkeleton />}
            isEmpty={businesses.length === 0}
            emptyIcon={Storefront}
            emptyText="Saved businesses will appear here."
          >
            <ul className="-mx-6 flex flex-col divide-y divide-border">
              {businesses.map((business) => (
                <li key={business.id}>
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
          <SavedSection
            error={trailsError}
            loading={trailsLoading}
            skeleton={<TwoLineSectionSkeleton inline />}
            isEmpty={trails.length === 0}
            emptyIcon={MapTrifold}
            emptyText="Saved trails will appear here."
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
        </TabsContent>

        <TabsContent value="completed">
          <SavedSection
            error={completedError}
            loading={completedLoading}
            skeleton={<TwoLineSectionSkeleton />}
            isEmpty={completed.length === 0}
            emptyIcon={CheckCircle}
            emptyText="Completed trails will appear here."
          >
            <ul className="-mx-6 flex flex-col divide-y divide-border">
              {completed.map((trail) => (
                <li key={trail.id}>
                  <CompletedTrailRow trail={trail} onClick={() => navigate(`/trails/${trail.id}`)} />
                </li>
              ))}
            </ul>
          </SavedSection>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
