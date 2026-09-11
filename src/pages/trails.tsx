import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchPublishedTrails } from "@/lib/trail-query";
import type { TrailSummary } from "@/lib/trail-types";
import { TrailCard } from "@/components/public/trail-card";
import { Skeleton } from "@/components/ui/skeleton";

// Phase 2.4: same PostgrestError shape-check home.tsx's errorMessageFrom
// and discover.tsx's Phase 8.3 catch both already use (a plain object
// with a .message field, not an Error subclass). Not imported from
// either, home-query.ts's version is page-local and discover.tsx's is
// inline, so there's no shared helper to reuse yet, per constraints.md's
// Inventory Before Suggesting rule this stays a local copy rather than
// inventing a new shared module for one more caller.
function errorMessageFrom(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string"
    ? err.message
    : fallback;
}

// Phase 2.4: row-shaped skeletons, same three-row primitive discover-
// list.tsx and home.tsx's SectionSkeleton both already use, not a
// spinner, per ponytail's native-feature-first rung (reuse the existing
// Skeleton primitive rather than adding a spinner dependency).
function TrailListSkeleton() {
  return (
    <ul className="mx-auto flex max-w-md flex-col divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex flex-col gap-2 px-6 py-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </li>
      ))}
    </ul>
  );
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
 */
export default function TrailsPage() {
  const navigate = useNavigate();
  const [trails, setTrails] = useState<TrailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPublishedTrails()
      .then(setTrails)
      .catch((err: unknown) => {
        setError(errorMessageFrom(err, "Could not load trails."));
        setTrails([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex h-full w-full flex-col py-6">
      <h1 className="mx-auto w-full max-w-md px-6 text-xl font-semibold text-foreground">Trails</h1>

      <div className="mt-4">
        {error ? (
          // Checked first, ahead of loading and empty, matching discover-
          // list.tsx's and home.tsx's established ordering.
          <div className="flex items-center justify-center px-6 py-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : loading ? (
          <TrailListSkeleton />
        ) : trails.length === 0 ? (
          // Phase 2.4/6.3: one clear, specific line, no second phrase
          // restating it, per ux-ui-guidelines.md's Label Rules. Distinct
          // wording from Discover's and Home's own empty states ("No
          // results match your search and filters.", "No announcements
          // yet.", "No recently verified content yet."), per home.tsx's
          // own precedent of per-section distinct copy.
          <div className="flex items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
            No published trails yet.
          </div>
        ) : (
          <ul className="mx-auto flex max-w-md flex-col divide-y divide-border">
            {trails.map((trail) => (
              <li key={trail.id}>
                <TrailCard trail={trail} onClick={() => navigate(`/trails/${trail.id}`)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
