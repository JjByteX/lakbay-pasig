import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Navigation, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { fetchTrailDetail } from "@/lib/trail-query";
import { getRouteProgress, unlockStop, resetRouteProgress, type RouteProgress } from "@/lib/trail-progress";
import { completeTrail, isRouteCompleted } from "@/lib/trail-completion";
import { distanceKm, type Coordinates } from "@/lib/discover-query";
import type { TrailDetail } from "@/lib/trail-types";
import { TrailStop } from "@/components/public/trail-stop";
import { SaveRouteButton } from "@/components/public/save-route-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Phase 2.4's same PostgrestError shape-check (trails.tsx, home.tsx,
// discover.tsx's Phase 8.3 catch all already use this), no shared helper
// exists yet to import instead, per constraints.md's Inventory Before
// Suggesting rule this stays a local copy rather than inventing one.
function errorMessageFrom(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string"
    ? err.message
    : fallback;
}

/**
 * Step 7, Phase 3: trail detail page, guest preview. Route /trails/:id
 * already wired (Phase 2.1, App.tsx). Guest-visible content first, per
 * navigation-and-access-control.md's Guest Trail Preview Decision: full
 * preview (stop list, duration, budget, theme, run type) works with zero
 * session state, before any sign-in gated behavior (Phase 4) is layered
 * on top.
 *
 * 3.1: fetches trail detail, stops, discovery content, and credential in
 * one call via fetchTrailDetail (trail-query.ts, Phase 1.3-1.4), keyed by
 * useParams().id. Same loading/not-found shape discover-place-detail.tsx
 * and event-detail.tsx already use for a single-record detail page: back
 * button top-left (ArrowLeft, matching every other public detail page),
 * then loading, then not-found, then loaded, in that order.
 *
 * 4.2: loads the signed-in user's route_progress row on mount, once the
 * trail itself has resolved. Same shape save-button.tsx's own effect
 * already establishes for a signed-in-only read: no session, no fetch,
 * state resets to null (guest keeps seeing Phase 3.3's plain name-only
 * list, per navigation-and-access-control.md); a fetch failure also
 * falls back to null rather than surfacing a second error state, since a
 * user with no saved position is a normal, valid outcome and not
 * something this read should error the whole page over.
 *
 * 4.3: Start button, authenticated branch. No existing route_progress row
 * -> Start creates one at the trail's first stop (unlockStop, trail-
 * progress.ts, upserts on (user_id, route_id) per migration 0018's unique
 * constraint, this is what makes it "the first row" rather than one of
 * many). An existing row -> the button reads "Resume" instead of "Start"
 * and does not call unlockStop again or touch route_progress at all, this
 * is the entire reason Phase 0's route_progress table exists in the first
 * place (a finished/abandoned-and-reopened session must not restart from
 * stop one). Either branch also swaps the Phase 3.3 plain `<li>` stop list
 * for trail-stop.tsx's three-state render (Phase 4.1), computing each
 * stop's state from routeProgress.highestUnlockedStopId: every stop up to
 * and including the highest unlocked one renders unlocked, or completed
 * once the whole trail is finished (Phase 5.1-5.3), everything after
 * stays locked. No progress at all (guest, or a signed-in user who
 * hasn't started) keeps every stop locked, matching Phase 3.3's original
 * "no progress yet" baseline.
 *
 * 4.4: GPS proximity read, while the page is open. Same
 * navigator.geolocation entry point discover.tsx's existing geolocation
 * effect already uses (no new dependency, per the ponytail skill's
 * native-feature-first rung), but watchPosition instead of
 * getCurrentPosition: discover.tsx only needed a one-time fallback
 * center for a map, this page's unlock check (Phase 4.5) has to react
 * to the user physically moving closer while the page stays open, a
 * single read can't do that. Denied or unavailable geolocation is a
 * silent no-op, matching discover.tsx's own fallback reasoning exactly
 * ("a fallback, not a required permission, so no error state blocks
 * either surface") — proximity unlock degrades to "nothing unlocks by
 * GPS," it does not block viewing the guest preview or the stop list.
 * Watch is cleared on unmount (clearWatch), and re-armed if the route id
 * changes, so navigating from one trail's detail page to another does
 * not leave a stale watch running against the previous trail.
 *
 * 4.5: unlock check. Runs whenever watchedPosition (4.4) or the computed
 * "current locked stop" changes. Only ever checks the single next locked
 * stop in sequence (routeProgress.highestUnlockedStopId's index + 1, or
 * the first stop if nothing is unlocked yet), never every locked stop at
 * once, since a trail is a sequence, not a set, per build-priorities.md's
 * "each stop should reference the last one" and step-7-phases.md's own
 * "for the current locked stop" wording. A stop with no resolved
 * coordinate (TrailStop.latitude/longitude null, trail-query.ts's own
 * documented case for a place/business with no geocoded address yet)
 * can't be distance-checked, so it's skipped rather than treated as
 * always-in-range or always-out-of-range, matching discover-query.ts's
 * sortDiscoverResults's own "can't compute, don't guess" handling for
 * the same null case.
 *
 * Distance math reuses discover-query.ts's exported distanceKm (haversine,
 * kilometers) rather than reimplementing it, per step-7-phases.md's 4.5
 * instruction and constraints.md's Inventory Before Suggesting rule.
 * unlock_radius (discovery_content, migration 0005) is stored in meters,
 * matching admin-trail-builder.tsx's own "Unlock Radius (meters)" label
 * and its `Unlocks within {n}m` summary text, so distanceKm's km result is
 * converted (* 1000) before comparing, not the other way around.
 *
 * Inside the radius: unlockStop (trail-progress.ts, 1.5) writes the new
 * highest_unlocked_stop_id, then routeProgress state updates locally so
 * trail-stop.tsx re-renders that stop as unlocked immediately, no page
 * reload or refetch, per step-7-phases.md's own "update local state ...
 * no page reload" instruction. A stop already covered by routeProgress
 * (index <= highestUnlockedIndex) is not re-checked or re-written, this
 * effect only ever advances progress, it never reruns unlockStop for a
 * stop already unlocked. Write failures are silent here (no visible error
 * state), matching 4.4's own reasoning for a denied/unavailable GPS read:
 * this is a background convenience check running continuously while the
 * page is open, not a single user-initiated action like Start (which does
 * show startError) — the same physical movement that triggered a failed
 * attempt will trigger another the next time watchPosition fires, no
 * "try again" prompt is meaningful for a check that retries itself.
 *
 * 4.6 (locked state, no early-force): this effect is the only thing that
 * ever calls unlockStop from proximity. Nothing else in this file offers
 * a button, link, or tap target to open a locked stop early — a stop
 * outside its radius simply never gets checked into range, it renders
 * through trail-stop.tsx's ordinary locked branch (Phase 4.1), not a
 * disabled control or an error/empty state (4.6's own instruction: this
 * is a normal loaded state, not to be built through 6.1/6.3's branches).
 *
 * 4.7: save action. SaveRouteButton (save-route-button.tsx) sits in the
 * header's back-button row, same placement discover-place-detail.tsx
 * already establishes for SaveButton (place-only, save-button.tsx) --
 * a flex row with the back control on the left and the save toggle on
 * the right. Reuses save-button.tsx's exact heart-icon pattern per the
 * plan doc's explicit instruction not to invent a new interaction,
 * wired to saved-routes.ts (Phase 1.6) instead of saved-places.ts. Same
 * signed-out behavior: a signed-out tap navigates to /login, never a
 * disabled heart, per ux-ui-guidelines.md's Disabled/gated rule.
 *
 * Phase 5: completion and credential, own file src/lib/trail-
 * completion.ts (isRouteCompleted, completeTrail), matching every other
 * table in this domain having its own lib file rather than this page
 * calling supabase directly.
 *
 * 5.1: detect last-stop unlock. Both places that can unlock a stop --
 * the proximity effect (4.5) and handleStart's first-stop unlock (4.3,
 * covers the edge case of a one-stop trail, whose first unlock is also
 * its last) -- call a shared maybeCompleteTrail helper after their own
 * unlockStop write succeeds, rather than duplicating the "is this the
 * final stop" check in two places.
 *
 * 5.2: write completion records. completeTrail inserts completed_routes,
 * then user_credentials if trail.credential exists, both owner-writable
 * per migration 0007, no staff involvement, matching admin-panel-
 * spec.md's Trail Publishing section. Guarded by `completed` state
 * (loaded on mount via isRouteCompleted, same signed-in-only shape as
 * routeProgress's own 4.2 load) so a trail already finished on a prior
 * visit never attempts a second completed_routes insert from a later
 * proximity re-check. A brief "Saving your completion…" line shows while
 * the write is in flight (completing state), a real consumer rather than
 * a merely-declared one, same reasoning Phase 4.2's own routeProgress
 * fix used for tsconfig.app.json's noUnusedLocals.
 *
 * 5.3: show the credential earned. The existing "Earn: {name}" badge
 * (3.2) relabels to "Earned: {name}" once completed, same accent
 * treatment reused rather than a new one. A completed trail with no
 * linked credential shows a plain "Trail completed" line instead
 * (CheckCircle2, matching trail-stop.tsx's own completed-state icon).
 * No leaderboard, no per-user rank, no personal-best framing anywhere,
 * per competitive-positioning.md and build-priorities.md's hard rule.
 * No cohort completion count either: trail-completion.ts has no query
 * for one, the plan doc only requires it "if shown at all," it doesn't
 * require adding one in this phase.
 *
 * 5.4: progress cleanup on restart. A "Restart trail" control appears
 * beneath Start/Resume once completed, calling resetRouteProgress
 * (trail-progress.ts, 1.5) to delete the route_progress row outright
 * rather than reset it to the first stop -- a deleted row and a never-
 * started row read identically to every consumer of getRouteProgress.
 * completed_routes is left untouched by a restart, that table is a
 * completion event log, not current progress, so a prior finish stays
 * on record even if the trail is walked again.
 */
export default function TrailDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [trail, setTrail] = useState<TrailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeProgress, setRouteProgress] = useState<RouteProgress | null>(null);
  // 4.3: Start/Resume is its own async action, separate from the page's
  // own load state above, same split save-button.tsx's loading/error pair
  // establishes for its own signed-in write.
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // 4.4: current watched position, null until the browser returns a first
  // reading (or forever, if geolocation is denied/unavailable, matching
  // discover.tsx's own fallback). Consumed by 4.5's unlock check once that
  // phase exists; this phase's only consumer is the inert indicator below.
  const [watchedPosition, setWatchedPosition] = useState<Coordinates | null>(null);
  // Phase 5.1-5.3: whether the signed-in user has already completed this
  // specific route (completed_routes, checked once the trail resolves,
  // same signed-in-only shape as the routeProgress load in 4.2). Drives
  // the last-stop-unlock detection below (5.1 only fires once, not on
  // every subsequent proximity re-check of an already-finished trail)
  // and the credential-earned display (5.3): true from either a fresh
  // completion just now or a completion from a prior visit, trail-
  // stop.tsx's own "completed" state (Phase 4.1) doesn't distinguish the
  // two, so this state doesn't need to either.
  const [completed, setCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  // Phase 5.4: restart is its own async action, same loading/error split
  // as starting/startError (4.3) and the save button's own pattern.
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setError(null);

    fetchTrailDetail(id)
      .then((detail) => {
        if (!detail) {
          setNotFound(true);
          return;
        }
        setTrail(detail);
      })
      .catch((err: unknown) => setError(errorMessageFrom(err, "Could not load this trail.")))
      .finally(() => setLoading(false));
  }, [id]);

  // 4.2: signed-in only. No session, no fetch, no progress, matching
  // save-button.tsx's own isPlaceSaved effect exactly. Keyed on the
  // trail's own id (not the route param directly) so this only runs once
  // a real published route has resolved, not on a not-found or
  // still-loading id.
  useEffect(() => {
    if (!session || !trail) {
      setRouteProgress(null);
      return;
    }
    getRouteProgress(session.user.id, trail.id)
      .then(setRouteProgress)
      .catch(() => setRouteProgress(null));
  }, [session, trail]);

  // Phase 5.1-5.3: same signed-in-only shape as the effect above, checks
  // whether this route is already in completed_routes for this user. No
  // session or no trail yet resets to false, matching every other
  // signed-in-only read in this file (routeProgress, save-button.tsx's
  // isPlaceSaved) rather than surfacing a second error state for a
  // perfectly normal "not completed yet" outcome.
  useEffect(() => {
    if (!session || !trail) {
      setCompleted(false);
      return;
    }
    isRouteCompleted(session.user.id, trail.id)
      .then(setCompleted)
      .catch(() => setCompleted(false));
  }, [session, trail]);

  // 4.4: GPS proximity read, while the page is open. watchPosition (not
  // discover.tsx's one-time getCurrentPosition), since the unlock check
  // (Phase 4.5) has to react to the user moving closer, not just a
  // starting fallback. Keyed on id so a watch started for one trail is
  // torn down (clearWatch) before a new one starts if the route param
  // changes, rather than two watches running at once. Runs for guest and
  // signed-in alike: viewing a locked stop list needs no session (Phase
  // 3), only the unlock write Phase 4.5 adds will actually require one.
  useEffect(() => {
    if (!id || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setWatchedPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        // Denied or unavailable: silent no-op, matching discover.tsx's
        // own reasoning exactly, proximity unlock is a fallback feature,
        // not a required permission the guest preview or stop list
        // depend on.
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [id]);

  // 4.5: unlock check. Signed-in only, matching every other route_progress
  // write in this file (route_progress_own RLS, migration 0018, rejects an
  // unauthenticated write regardless, this is an app-layer mirror of that
  // same gate, not a new rule). No routeProgress row yet means the trail
  // hasn't been Started, so there is no "current stop" to check against,
  // proximity unlock only ever advances a sequence that Start (4.3) has
  // already begun, it never starts one on its own. The next locked stop
  // is the one immediately after routeProgress's highestUnlockedStopId in
  // trail.stops' sequence_order-ascending order (trail-query.ts's own
  // fetch order); once every stop is already unlocked there is nothing
  // left to check.
  useEffect(() => {
    if (!session || !trail || !routeProgress || !watchedPosition) return;

    const highestIndex = trail.stops.findIndex((s) => s.id === routeProgress.highestUnlockedStopId);
    const nextStop = trail.stops[highestIndex + 1];
    if (!nextStop) return;

    // No resolved coordinate for this stop (trail-query.ts's documented
    // null case, a place/business with no geocoded address yet): nothing
    // to compare against, skip rather than guessing in or out of range.
    if (nextStop.latitude == null || nextStop.longitude == null) return;

    // A stop with no unlock_radius attached (no discovery_content row for
    // it, trail-types.ts's own documented null case) has nothing to unlock
    // against either, same skip.
    if (!nextStop.discoveryContent) return;

    const distanceMeters =
      distanceKm(watchedPosition, { latitude: nextStop.latitude, longitude: nextStop.longitude }) * 1000;

    if (distanceMeters > nextStop.discoveryContent.unlock_radius) return;

    // Inside radius: advance route_progress to this stop. Local state
    // updates immediately so trail-stop.tsx re-renders it unlocked with no
    // page reload, per step-7-phases.md's own instruction; the write
    // itself fails silently (see docblock above) rather than surfacing a
    // visible error, this is a background check that will simply try
    // again on the next watchPosition reading.
    unlockStop(session.user.id, trail.id, nextStop.id)
      .then(() => {
        setRouteProgress({ highestUnlockedStopId: nextStop.id, unlockedAt: new Date().toISOString() });
        maybeCompleteTrail(nextStop.id);
      })
      .catch(() => {
        // Silent, see docblock: no user-facing retry for a check that
        // already retries itself on the next position update.
      });
  }, [session, trail, routeProgress, watchedPosition, completed]);

  // Phase 5.1: shared by both places that can unlock the final stop --
  // the proximity effect above (the normal multi-stop case) and
  // handleStart below (a one-stop trail's first unlock is also its last,
  // there is no proximity step in between the two). Keeping this as one
  // function rather than duplicating the same "is this the last stop"
  // check in both call sites, per ponytail's reuse-over-duplication rule.
  // Guarded on !completed so a trail already finished (isRouteCompleted's
  // load, or an earlier finish this session) never inserts a second
  // completed_routes row.
  function maybeCompleteTrail(unlockedStopId: string) {
    if (!session || !trail || completed) return;
    const isFinalStop = trail.stops[trail.stops.length - 1]?.id === unlockedStopId;
    if (!isFinalStop) return;

    setCompleted(true); // optimistic, matches the unlock write it follows
    setCompleting(true);
    setCompleteError(null);
    completeTrail(session.user.id, trail.id, trail.credential?.id)
      .catch(() => {
        setCompleted(false); // revert: completion write failed
        setCompleteError("Couldn't record your completion. Try again.");
      })
      .finally(() => setCompleting(false));
  }

  // 3.4/4.3: Start button. Unauthenticated branch unchanged from Phase 3,
  // visible to everyone, never disabled, reusing save-button.tsx's exact
  // pattern: a signed-out tap navigates to /login, it does not render a
  // disabled control (ux-ui-guidelines.md's Disabled/gated rule).
  //
  // Authenticated branch, this phase: no existing routeProgress row means
  // this is a first Start, so it unlocks the trail's first stop
  // (trail.stops[0], sequence_order-ascending per trail-query.ts's own
  // fetch order) via unlockStop, which upserts on (user_id, route_id) and
  // therefore creates the row. An existing routeProgress row means the
  // user already started (or finished, once Phase 5 exists) this trail,
  // so the button resumes instead of restarting: no write happens at all,
  // trail-stop.tsx below already renders the saved position from state
  // already loaded in the 4.2 effect. This is step-7-phases.md's 4.3
  // instruction verbatim: "If progress already exists, Start ... resumes
  // at the saved position instead of restarting, this is the entire
  // reason Phase 0 exists."
  function handleStart() {
    if (!session) {
      navigate("/login");
      return;
    }

    // Trail has no stops to start (Phase 2.4's own empty case). The
    // button is disabled below for this case already, this guard is a
    // second backstop, not the only check, matching ponytail's rule
    // against trusting a UI-only guard for a state the render already
    // prevents from being reachable.
    if (!trail || trail.stops.length === 0) return;

    // Resume: progress already exists, no write, no state change. The
    // stop list below already reflects it from the 4.2 load.
    if (routeProgress) return;

    setStarting(true);
    setStartError(null);
    const firstStopId = trail.stops[0].id;
    unlockStop(session.user.id, trail.id, firstStopId)
      .then(() => {
        setRouteProgress({ highestUnlockedStopId: firstStopId, unlockedAt: new Date().toISOString() });
        maybeCompleteTrail(firstStopId);
      })
      .catch(() => setStartError("Couldn't start this trail. Try again."))
      .finally(() => setStarting(false));
  }

  // Phase 5.4: "If a user abandons a trail and restarts it ... the
  // route_progress row to be deleted or reset, not left pointing at a
  // finished sequence." resetRouteProgress (trail-progress.ts, 1.5)
  // deletes the row outright rather than resetting it to the first stop,
  // matching that function's own file comment: a deleted row and a
  // never-started row read identically to every consumer of
  // getRouteProgress (null either way), so there's no reason to leave a
  // first-stop row behind when "no row" already means exactly that.
  // completed_routes is intentionally left untouched by a restart: that
  // table is a completion *event* log (competitive-positioning.md's
  // cohort-stat source), not current progress, so a prior finish stays
  // on record even if the person walks it again.
  //
  // This means local `completed` state deliberately drifts from
  // isRouteCompleted's own DB truth the moment a restart happens: the
  // row in completed_routes still exists (on purpose, see above), but
  // this page needs the trail to render as in-progress again (stop
  // list back to locked/unlocked, Start/Resume button back instead of
  // the credential display) so the person can actually re-walk it.
  // setCompleted(false) here is that local override. It's stable
  // because the isRouteCompleted effect is keyed on [session, trail],
  // neither of which changes on a restart, so it never re-fires to pull
  // completed back to true from the still-existing row. A second finish
  // then calls maybeCompleteTrail again (its own !completed guard is
  // now clear), inserting a second, genuinely separate completed_routes
  // row -- two walks completed twice, not one duplicated.
  function handleRestart() {
    if (!session || !trail) return;

    setResetting(true);
    setResetError(null);
    resetRouteProgress(session.user.id, trail.id)
      .then(() => {
        setRouteProgress(null);
        setCompleted(false);
      })
      .catch(() => setResetError("Couldn't restart this trail. Try again."))
      .finally(() => setResetting(false));
  }

  // 3.2: no verification badge here, per the plan doc's explicit
  // reasoning: a trail isn't a place or business record with its own
  // verification_status, only staff can publish one (routes_write_staff,
  // build_trails permission, 0005), so publication itself is the trust
  // signal. Metadata line joins theme, duration, budget, and run type,
  // same "join with a middot" shape trail-card.tsx's row already uses.
  const metaLine = trail
    ? [trail.theme, trail.estimated_duration, trail.estimated_budget, trail.run_type]
        .filter(Boolean)
        .join(" · ")
    : "";

  // 4.3: Start button label and disabled state. Guest and a signed-in
  // user with no progress both read "Start trail"; a signed-in user with
  // an existing route_progress row reads "Resume trail" instead, per the
  // plan doc's resume-not-restart instruction. Disabled only for the
  // empty-trail case (ux-ui-guidelines.md's Disabled/gated rule: a
  // disabled action must communicate why, so it's paired with the
  // already-existing "No stops added to this trail yet." message below,
  // not a bare disabled button with no explanation) or while the start
  // write is in flight. Never disabled for a signed-out guest, matching
  // save-button.tsx's pattern of always tappable, gate on tap not on
  // render.
  const hasStops = (trail?.stops.length ?? 0) > 0;
  const startLabel = routeProgress ? "Resume trail" : "Start trail";

  // 4.3/5.3: per-stop state for trail-stop.tsx (Phase 4.1), computed from
  // routeProgress.highestUnlockedStopId against each stop's own
  // sequence_order. Every stop up to and including the highest unlocked
  // one renders unlocked (or completed, once the whole trail is finished,
  // Phase 5.1-5.3's `completed` state below); everything after stays
  // locked. No routeProgress (guest, or a signed-in user who hasn't
  // started) means every stop is locked, matching Phase 3.3's original
  // baseline before progress existed. Every unlocked stop flips to
  // completed together once the trail itself is completed, not just the
  // final stop, since "completed" is this component's per-stop visual
  // marker of "this stop's content is not just visible, the whole walk
  // it belongs to is done," matching the plan doc's own "completed (same
  // as unlocked, visually marked done)" wording -- it never needed a
  // separate per-stop completed timestamp to compute, whole-trail
  // completion is enough.
  const highestUnlockedIndex = routeProgress
    ? (trail?.stops.findIndex((s) => s.id === routeProgress.highestUnlockedStopId) ?? -1)
    : -1;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {trail && <SaveRouteButton routeId={trail.id} />}
      </div>

      {error && <p className="text-base text-destructive">{error}</p>}

      {!error && loading && <p className="text-base text-muted-foreground">Loading…</p>}

      {!error && !loading && notFound && (
        <p className="text-base text-muted-foreground">This trail couldn&apos;t be found.</p>
      )}

      {!error && !loading && trail && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-foreground">{trail.name}</h1>
            {metaLine && <p className="text-sm text-muted-foreground">{metaLine}</p>}
            {/* Phase 5.3: once completed, the badge reads "Earned" instead
                of the aspirational "Earn," same accent treatment reused
                rather than a new color/token per ux-ui-guidelines.md's
                consistency rules -- only the label changes, not the
                component. No route with no credential ever reaches this
                branch since trail.credential is null in that case. */}
            {/* Phase 6.5: 320px overflow check. Badge (badge.tsx) is
                inline-flex with no width cap of its own; w-fit alone lets
                a long credential_name (plain `text` column, migration
                0007, no length cap, staff-authored via admin-trail-
                builder.tsx) push the badge itself wider than this
                max-w-md/px-6 container instead of wrapping inside it.
                max-w-full constrains the badge to the container's width;
                break-words lets a long name wrap inside that width rather
                than overflow it. No new token invented, both are stock
                Tailwind utilities already in use elsewhere in this
                codebase for the same reason. */}
            {trail.credential && (
              <Badge variant="accent" className="w-fit max-w-full break-words">
                {completed ? "Earned" : "Earn"}: {trail.credential.credential_name}
              </Badge>
            )}
            {/* Phase 5.3: "show the credential earned" for a completed
                trail with no linked credential (trail.credential null)
                still needs *some* completion acknowledgment, per the
                plan doc's own "shows the credential earned" instruction
                reading as this page's confirmation that the walk itself
                is done -- CheckCircle2 matches trail-stop.tsx's existing
                completed-state icon (Phase 4.1), not a new concept.
                Explicitly no leaderboard, no per-user rank, no personal-
                best framing anywhere on this line or elsewhere on this
                page, per competitive-positioning.md and build-
                priorities.md's hard rule, restated verbatim in the plan
                doc. No cohort completion count is shown either: no query
                for one exists yet (trail-completion.ts is insert/exists-
                check only), and the plan doc itself only requires this
                "if a completion count is shown at all," it doesn't
                require adding one now. */}
            {completed && !trail.credential && (
              <span className="flex w-fit items-center gap-1 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 fill-primary text-primary-foreground" aria-hidden="true" />
                Trail completed
              </span>
            )}
            {/* Specific to the completion write failing, not a generic
                message, matching every other direction-specific error
                in this file (startError, save-route-button.tsx's own
                error state). completing shows a brief "Saving…" line
                while the write is in flight -- unlike 4.5's silent
                background proximity retries (a check that keeps
                retrying itself needs no progress text), completeTrail
                is a one-shot write with a real end state to report,
                and noUnusedLocals (tsconfig.app.json) requires this
                state have a genuine consumer, not just a setter call,
                same reasoning Phase 4.2's own routeProgress fix used. */}
            {completing && <p className="text-xs text-muted-foreground">Saving your completion…</p>}
            {completeError && <p className="text-xs text-destructive">{completeError}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <Button type="button" onClick={handleStart} disabled={!hasStops || starting} className="w-full">
              {startLabel}
            </Button>
            {/* Specific to the start/resume write failing, not a generic
                message, matching save-button.tsx's error-message
                convention (text-destructive, direction-specific copy). */}
            {startError && <p className="text-xs text-destructive">{startError}</p>}
            {/* Phase 5.4: "the route_progress row to be deleted or reset
                ... restarts, on the same accessible entry point Start
                already provides" -- placed directly beneath Start rather
                than a separate control elsewhere on the page, only shown
                once a trail is completed (restarting an in-progress,
                unfinished trail isn't this phase's scope, the plan doc's
                own wording is "if a user abandons a trail and restarts
                it" in the context of a trail already finished). variant
                outline keeps it visually secondary to the Start/Resume
                button per ux-ui-guidelines.md's 60/30/10 color rule, the
                accent (10%) stays reserved for the primary action above. */}
            {completed && (
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRestart}
                  disabled={resetting}
                  className="w-full"
                >
                  Restart trail
                </Button>
                {resetError && <p className="text-xs text-destructive">{resetError}</p>}
              </div>
            )}
          </div>

          {/* 3.3/4.3: stop list. Numbered sequence, not an unordered
              list, since sequence is the entire point of a trail per
              build-priorities.md's "each stop should reference the last
              one and set up the next" -- order is meaningful content
              here, not decoration. Now rendered through trail-stop.tsx
              (Phase 4.1)'s three-state component instead of Phase 3.3's
              plain row, state computed above from routeProgress. Guest
              and a not-yet-started signed-in user both see every stop
              locked (name only), which still satisfies navigation-and-
              access-control.md's "full preview, no restriction" line for
              the stop list itself -- locked is a content state, not a
              hidden one, the name is always visible. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Stops</h2>
              {/* 4.4: inert reflection of the watched position this
                  phase loads, not a control, not an unlock decision
                  (Phase 4.5). Only rendered once a reading has actually
                  come back, so a denied/unavailable permission (silent
                  no-op above) shows nothing here rather than a stuck
                  "waiting" state. Navigation is lucide-react's existing
                  location/compass concept, paired with a text label per
                  ux-ui-guidelines.md's icon rules, since "GPS active"
                  is not one of the universally-recognized icon-only
                  exceptions (home, search, close, back, play, pause). */}
              {watchedPosition && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Navigation className="h-3 w-3" aria-hidden="true" />
                  GPS active
                </span>
              )}
            </div>
            {trail.stops.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stops added to this trail yet.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {trail.stops.map((stop, index) => (
                  <TrailStop
                    key={stop.id}
                    stop={stop}
                    index={index}
                    state={
                      index > highestUnlockedIndex ? "locked" : completed ? "completed" : "unlocked"
                    }
                  />
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
