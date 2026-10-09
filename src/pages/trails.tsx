import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { fetchPublishedTrails } from "@/lib/trail-query";
import { fetchMyTrails, type PersonalTrailSummary } from "@/lib/personal-trails";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import type { TrailSummary } from "@/lib/trail-types";
import { TrailCard } from "@/components/public/trail-card";
import { PageContainer } from "@/components/public/page-container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapTrifold, Plus } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePageTitle } from "@/lib/page-title";

// Phase 2.4: same PostgrestError shape-check home.tsx's errorMessageFrom
// and discover.tsx's Phase 8.3 catch both already use (a plain object
// with a .message field, not an Error subclass). Not imported from
// either, home-query.ts's version is page-local and discover.tsx's is
// inline, so there's no shared helper to reuse yet, per constraints.md's
// Inventory Before Suggesting rule this stays a local copy rather than
// inventing a new shared module for one more caller.

// Phase 6.2: row-shaped skeletons matching trail-card.tsx's own row shape
// exactly, not discover-list.tsx's skeleton copied wholesale (that list's
// real row has three elements: name, category, and a VerificationBadge,
// hence its three Skeleton lines; discover-place-detail.tsx's own note
// on why trails carry no verification badge, Phase 3.2, is exactly why
// trail-card.tsx's row only ever has two: name, then one metadata line
// joining theme/duration/budget). Same Skeleton primitive already in
// use, not a spinner, per ponytail's native-feature-first rung. Three
// placeholder rows is a row count, unrelated to each row's own line
// count, and stays a placeholder not tied to the eventual result count.
function TrailListSkeleton() {
  return (
    <ul className="-mx-6 flex flex-col divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex flex-col gap-1 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <Skeleton className="h-4 w-2/3 md:w-1/3" />
          <Skeleton className="h-3 w-1/3 md:w-1/6" />
        </li>
      ))}
    </ul>
  );
}

function stopCountLabel(count: number): string {
  return `${count} ${count === 1 ? "stop" : "stops"}`;
}

/**
 * Step 7, Phase 2.3-2.4: replaces the stub (step-5-phases.md Phase 2.5),
 * per build-order.md item 7 and step-7-trail-plan.md's Trail catalog
 * page section. Fetches via fetchPublishedTrails (trail-query.ts, Phase
 * 1.2) and renders a list of TrailCard rows (Phase 2.2); tap navigates
 * to /trails/:id (Phase 2.1's route, Phase 3's page). No auth gate here,
 * per navigation-and-access-control.md's Trails row ("full browse
 * access... Starting a trail or tracking progress requires sign-in") --
 * the catalog itself is Guest-visible with zero restriction.
 *
 * States ordered error, then loading, then empty, then loaded, same
 * order discover-list.tsx and home.tsx already establish, per step-7-
 * trail-plan.md's own States section. This is a first correct pass per
 * Phase 2.4's own note, not a placeholder to redo later; the full
 * cross-cutting polish pass is Phase 6.
 *
 * Personal trails (migration 0054, docs/user-trails-plan.md): a "Make a
 * trail" button for everyone (a guest is asked to sign in, in place, same as
 * Save and Start) and, for a signed-in person who has made some, a "Your
 * trails" section above the catalog. The section is private to them and
 * labelled as theirs, and the catalog is headed "CATO trails" once it shows.
 * A failed read of the section leaves it out and never blocks the catalog.
 */
export default function TrailsPage() {
  usePageTitle("Trails");
  const navigate = useNavigate();
  const { session } = useAuth();
  const { openAuth } = useAuthModal();
  const userId = session?.user.id;
  const [myTrails, setMyTrails] = useState<PersonalTrailSummary[]>([]);
  const [trails, setTrails] = useState<TrailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPublishedTrails()
      .then(setTrails)
      .catch(() => {
        setError("Couldn't load trails. Check your connection and try again.");
        setTrails([]);
      })
      .finally(() => setLoading(false));
  }, [reload]);

  // Signed-in only. Reloaded with the catalog's retry, and cleared on sign out.
  useEffect(() => {
    if (!userId) {
      setMyTrails([]);
      return;
    }
    fetchMyTrails(userId)
      .then(setMyTrails)
      .catch(() => setMyTrails([]));
  }, [userId, reload]);

  function handleMakeTrail() {
    if (!session) {
      openAuth("login");
      return;
    }
    navigate("/trails/new");
  }

  // Extracted from a nested ternary (error ? ... : loading ? ... :
  // trails.length === 0 ? ... : ...) inline in the render below. States
  // ordered error, then loading, then empty, then loaded, same order
  // discover-list.tsx and home.tsx already establish.
  let body: ReactNode;
  if (error) {
    body = (
      <ErrorState className="min-h-[60dvh]" onRetry={() => setReload((n) => n + 1)}>
        {error}
      </ErrorState>
    );
  } else if (loading) {
    body = <TrailListSkeleton />;
  } else if (trails.length === 0) {
    body = (
      <EmptyState icon={MapTrifold} className="min-h-[60dvh]">Published trails will appear here.</EmptyState>
    );
  } else {
    body = (
      <ul className="-mx-6 flex flex-col divide-y divide-border">
        {trails.map((trail) => (
          <li key={trail.id}>
            <TrailCard inline trail={trail} onClick={() => navigate(`/trails/${trail.id}`)} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <PageContainer width="wide" className="gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Trails</h1>
        <Button type="button" variant="outline" size="sm" onClick={handleMakeTrail}>
          <Plus weight="bold" className="mr-1 h-3 w-3" aria-hidden="true" />
          Make a trail
        </Button>
      </div>
      {myTrails.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">Your trails</h2>
          <p className="text-xs text-muted-foreground">Only you can see these.</p>
          {/* Mobile: full-width rows, the same as the catalog. md+: a grid of
              cards, so a few trails of your own do not read as a second
              catalog. */}
          <ul className="-mx-6 flex flex-col divide-y divide-border md:mx-0 md:mt-2 md:grid md:grid-cols-2 md:gap-4 md:divide-y-0 lg:grid-cols-3">
            {myTrails.map((trail) => (
              <li key={trail.id} className="md:overflow-hidden md:rounded-lg md:border md:border-border md:bg-card">
                <TrailCard
                  trail={trail}
                  meta={stopCountLabel(trail.stopCount)}
                  onClick={() => navigate(`/trails/${trail.id}`)}
                />
              </li>
            ))}
          </ul>
          <h2 className="mt-4 text-base font-semibold text-foreground">CATO trails</h2>
        </section>
      )}
      {body}
    </PageContainer>
  );
}
