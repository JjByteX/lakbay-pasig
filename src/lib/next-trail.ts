import type { TrailSummary } from "./trail-types";
import { fetchPublishedTrails } from "./trail-query";
import { fetchCompletedRoutes } from "./trail-completion";

/**
 * The trail to suggest once a visitor finishes one: a published trail they
 * have not completed yet, preferring the same theme as the one they just
 * walked, otherwise the first in the catalog's own order. Null when they have
 * walked them all.
 *
 * A suggestion, not a ranking: no counts, no "most popular", no comparison
 * with anyone else (competitive-positioning.md). It reads only this visitor's
 * own completed trails (trail-completion.ts's fetchCompletedRoutes, the same
 * personal-record read the Saved page uses) and the published catalog.
 */
export async function fetchNextTrail(
  userId: string,
  current: { id: string; theme: string | null }
): Promise<TrailSummary | null> {
  const [published, completed] = await Promise.all([fetchPublishedTrails(), fetchCompletedRoutes(userId)]);
  const walked = new Set(completed.map((trail) => trail.id));
  walked.add(current.id);
  const candidates = published.filter((trail) => !walked.has(trail.id));
  if (candidates.length === 0) return null;
  return (current.theme ? candidates.find((trail) => trail.theme === current.theme) : undefined) ?? candidates[0];
}
