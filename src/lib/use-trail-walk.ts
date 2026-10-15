import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getRouteProgress, unlockStop, type RouteProgress } from "@/lib/trail-progress";
import { completeTrail, isRouteCompleted } from "@/lib/trail-completion";
import { fetchUnlockedEntryIds } from "@/lib/entry-unlocks";
import { distanceKm, type Coordinates } from "@/lib/discover-query";
import type { TrailDetail } from "@/lib/trail-types";

/**
 * Everything about a signed-in visitor walking one trail, in one place so the
 * trail page and the Discover map's trail mode behave identically: saved
 * progress, scanned entries, completion, and the GPS unlock check. Moved out
 * of trail-detail.tsx unchanged; the page used to own all of it, which meant a
 * stop would only ever unlock while that page was open. Now Discover (where
 * "Resume trail" lands) unlocks stops too.
 *
 * `position` comes from the caller: trail-detail runs its own watchPosition,
 * Discover reads the shell's (useUserLocation), so this hook starts no second
 * geolocation watch.
 *
 * Signed-in only, like every route_progress write (route_progress_own RLS,
 * migration 0018). No session, or no trail yet, leaves everything at its empty
 * value, and a failed read falls back to that same empty value rather than a
 * second error state: "no saved position" is a normal outcome.
 */
export function useTrailWalk(trail: TrailDetail | null, position: Coordinates | null) {
  const { session } = useAuth();
  // Entry ids this visitor has unlocked by scanning a QR code.
  const [unlockedEntryIds, setUnlockedEntryIds] = useState<Set<string>>(new Set());
  const [routeProgress, setRouteProgress] = useState<RouteProgress | null>(null);
  // True once progress has been read for this trail. trail-stop.tsx animates a
  // stop opening only after this is true, so stops opening because saved
  // progress just arrived stay still.
  const [progressChecked, setProgressChecked] = useState(false);
  const [completed, setCompleted] = useState(false);
  // True once isRouteCompleted has answered (or failed). The one stop
  // completion waits for it, so GPS arriving first cannot insert a second
  // completed_routes row for a trail already finished.
  const [completionChecked, setCompletionChecked] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  // True once a completion write has just succeeded on this visit, so the
  // completion moment plays once, here and now.
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    setJustCompleted(false);
  }, [trail]);

  useEffect(() => {
    if (!session || !trail) {
      setRouteProgress(null);
      setProgressChecked(false);
      return;
    }
    setProgressChecked(false);
    getRouteProgress(session.user.id, trail.id)
      .then((progress) => {
        setRouteProgress(progress);
        setProgressChecked(true);
      })
      .catch(() => {
        setRouteProgress(null);
        setProgressChecked(true);
      });
  }, [session, trail]);

  // Only entries that need a scan are looked up.
  useEffect(() => {
    if (!session || !trail) {
      setUnlockedEntryIds(new Set());
      return;
    }
    const scanIds = trail.stops.flatMap((s) => s.discoveryContent.filter((e) => e.requiresScan).map((e) => e.id));
    fetchUnlockedEntryIds(session.user.id, scanIds)
      .then(setUnlockedEntryIds)
      .catch(() => setUnlockedEntryIds(new Set()));
  }, [session, trail]);

  useEffect(() => {
    if (!session || !trail) {
      setCompleted(false);
      setCompletionChecked(false);
      return;
    }
    // A personal trail has no completion to look up.
    if (trail.personal) {
      setCompleted(false);
      setCompletionChecked(true);
      return;
    }
    setCompletionChecked(false);
    isRouteCompleted(session.user.id, trail.id)
      .then(setCompleted)
      .catch(() => setCompleted(false))
      .finally(() => setCompletionChecked(true));
  }, [session, trail]);

  // The one place that decides "is this the last stop". Guarded on !completed
  // so a trail already finished never inserts a second completed_routes row.
  const maybeCompleteTrail = useCallback(
    (unlockedStopId: string) => {
      // A personal trail never completes: completed_routes would refuse the row.
      if (!session || !trail || trail.personal || completed) return;
      const isFinalStop = trail.stops[trail.stops.length - 1]?.id === unlockedStopId;
      if (!isFinalStop) return;

      setCompleted(true); // optimistic, matches the unlock write it follows
      setCompleting(true);
      setCompleteError(null);
      completeTrail(session.user.id, trail.id, trail.credential?.id)
        .then(() => setJustCompleted(true))
        .catch(() => {
          setCompleted(false); // revert: completion write failed
          setCompleteError("Couldn't record your completion. Try again.");
        })
        .finally(() => setCompleting(false));
    },
    [session, trail, completed],
  );

  // Unlock check. No routeProgress row means the trail hasn't been Started, so
  // proximity only ever advances a sequence Start has begun. The next locked
  // stop is the one right after highestUnlockedStopId.
  useEffect(() => {
    if (!session || !trail || !routeProgress || !position) return;

    const highestIndex = trail.stops.findIndex((s) => s.id === routeProgress.highestUnlockedStopId);
    const nextStop = trail.stops[highestIndex + 1];

    // One stop trail: Start already unlocked its only stop, so it completes
    // here instead, once the visitor is inside that stop's radius.
    if (!nextStop) {
      const onlyStop = trail.stops.length === 1 ? trail.stops[0] : null;
      if (!onlyStop || !completionChecked || completed || completeError) return;
      if (onlyStop.latitude == null || onlyStop.longitude == null) return;
      const meters = distanceKm(position, { latitude: onlyStop.latitude, longitude: onlyStop.longitude }) * 1000;
      if (meters <= onlyStop.unlockRadius) maybeCompleteTrail(onlyStop.id);
      return;
    }

    // A place/business with no geocoded address yet: nothing to compare
    // against, skip rather than guess in or out of range.
    if (nextStop.latitude == null || nextStop.longitude == null) return;

    const distanceMeters = distanceKm(position, { latitude: nextStop.latitude, longitude: nextStop.longitude }) * 1000;
    if (distanceMeters > nextStop.unlockRadius) return;

    // Inside radius: advance route_progress. Local state updates immediately so
    // the stop re-renders unlocked with no reload; the write itself fails
    // silently because the next position update re-runs this check.
    unlockStop(session.user.id, trail.id, nextStop.id, nextStop.sequence_order)
      .then(() => {
        setRouteProgress({ highestUnlockedStopId: nextStop.id, unlockedAt: new Date().toISOString() });
        maybeCompleteTrail(nextStop.id);
      })
      .catch(() => {
        // Silent: retried on the next position update.
      });
  }, [session, trail, routeProgress, position, completed, completionChecked, completeError, maybeCompleteTrail]);

  return {
    unlockedEntryIds,
    routeProgress,
    setRouteProgress,
    progressChecked,
    completed,
    setCompleted,
    completionChecked,
    completing,
    completeError,
    justCompleted,
    setJustCompleted,
  };
}

/**
 * One stop's state from the saved progress: everything up to and including the
 * highest unlocked stop is open (or completed, once the whole trail is), the
 * rest stay locked. `highestUnlockedIndex` is -1 with no progress, which keeps
 * every stop locked.
 */
export function stopStateFor(
  index: number,
  highestUnlockedIndex: number,
  completed: boolean,
): "locked" | "completed" | "unlocked" {
  if (index > highestUnlockedIndex) return "locked";
  return completed ? "completed" : "unlocked";
}
