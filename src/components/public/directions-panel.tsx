import { useEffect, useState } from "react";
import { Car, Bicycle, Footprints, MapPin, SpeakerHigh, SpeakerX, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  formatDistance,
  viaName,
  type DirectionsErrorReason,
  type RouteGeometry,
  type RouteStep,
  type TravelMode,
} from "@/lib/directions";
import { formatStepInstruction } from "@/lib/osrm-instructions";
import type { DiscoverResult } from "@/lib/discover-types";
import type { CustomFrom } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { FromSearch } from "./from-search";
import { stepIcon } from "./step-icon";

// directions-panel-phases.md Phase 3: static shell only, no fetch, no
// open/close wiring, no mode switching -- confirms the layout fits before
// Phase 4 wires it to the Directions button and Phase 5 makes it
// interactive. Modeled on Google Maps' own directions panel (the
// reference image from the plan): a mode-icon row up top, From/To rows
// below, matching the familiarity principle in ux-ui-guidelines.md --
// reuse a pattern users already know rather than invent a new one.
//
// Plain fixed-position div, not a Radix Popover/Command/Sheet -- no such
// primitive exists in this codebase (architecture-notes.md's Current
// State Notes), and global-search-bar.tsx already establishes the same
// plain-div pattern for a panel that needs to float above other content
// without a new dependency.
const MODES: { mode: TravelMode; label: string; icon: typeof Car }[] = [
  { mode: "car", label: "Car", icon: Car },
  { mode: "bike", label: "Bike", icon: Bicycle },
  { mode: "foot", label: "Walk", icon: Footprints },
];

// Phase 5.4: OSRM returns duration in seconds (directions.ts's
// RouteGeometry.duration). "12 min" under an hour, "1 hr 5 min" at or
// above -- matches how a person reads a short walk versus a longer drive,
// not a raw minute count once it crosses 60. No existing formatter in
// this codebase to reuse (grepped src/lib first, per constraints.md's
// Inventory Before Suggesting rule) -- the one other duration field in
// the app, routes.estimated_duration, is a free-text staff-entered
// string, not a seconds value, so there's nothing to share this with.
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} hr ${minutes} min`;
}

// Phase 6.2: reuses DirectionsError's own three reasons (directions.ts),
// same set result-card.tsx's own Phase 3.2 error text already branches
// on -- one message per reason, not a generic fallback, per the plan's
// States section ("reuse DirectionsError's existing reasons... specific
// message per reason"). Wording differs slightly from result-card.tsx's
// copy since that copy is a DirectionsError.message string produced by
// directions.ts itself; this panel has no Error object to read a message
// off of once discover.tsx has caught it and narrowed to a reason (see
// discover.tsx's handleSelectMode), so the strings are declared here
// directly rather than reconstructing an Error just to read `.message`.
export const ERROR_MESSAGES: Record<DirectionsErrorReason, string> = {
  network: "Couldn't reach the routing service, try again.",
  "rate-limited": "Too many requests right now, wait a moment and try again.",
  "no-route": "No route found to this location.",
};

interface DirectionsPanelProps {
  result: DiscoverResult;
  selectedMode: TravelMode;
  onSelectMode: (mode: TravelMode) => void;
  onCancel: () => void;
  // Phase 5.4: RouteGeometry.duration for the currently selected mode,
  // null while Phase 6's loading state is in flight or before the first
  // fetch resolves. discover.tsx owns the fetch (5.2/5.3), this component
  // stays presentational -- formats and displays, does not fetch itself.
  durationSeconds: number | null;
  // directions-distance-and-from-phases.md Phase 1.4: RouteGeometry.distance
  // for the currently selected mode, same lifecycle as durationSeconds
  // above -- null under the same conditions, set and cleared together.
  distanceMeters: number | null;
  // Turn-by-turn phase 1: the first leg's steps (RouteGeometry.legs?.[0]?.
  // steps, directions.ts) for the currently selected mode, same lifecycle
  // as durationSeconds/distanceMeters above. Only the first leg: every
  // existing caller of fetchRoute passes no `via` points, so a route here
  // only ever has one leg; `via`-bearing callers (the itinerary generator)
  // don't render through this panel. Null/undefined (absent) both mean
  // "nothing to show" -- the panel renders the duration/distance row only,
  // same as before this phase, rather than an empty list.
  steps: RouteStep[] | null | undefined;
  // Alternative routes: the selected route, whose `alternatives` (directions.ts)
  // are the other options. With none, the panel shows the plain time and
  // distance row as before. onSelectRoute swaps one in (public-shell.tsx's
  // handleSelectRoute), nothing is fetched.
  route: RouteGeometry | null;
  onSelectRoute: (alternative: RouteGeometry) => void;
  // Phase 6.1: true while a mode tap's fetchRoute is in flight
  // (discover.tsx's modeLoading, already tracked since 5.3's single-
  // flight guard -- reused here rather than a second loading flag).
  isLoading: boolean;
  // Phase 6.2: set by discover.tsx when a mode-switch fetch throws,
  // cleared on the next successful fetch or a fresh Directions tap. Null
  // means no error to show -- the normal duration or loading row renders
  // instead.
  errorReason: DirectionsErrorReason | null;
  // directions-distance-and-from-phases.md Phase 4.6: the custom From's
  // display label, or null when none is set (the common case), in which
  // case the From row reads "Your location". Only the label crosses into
  // this component, not the whole CustomFrom: nothing here reads its
  // coordinates, and hasCustomFrom below is just `fromLabel !== null`.
  fromLabel: string | null;
  // A search pick from FromSearch. The shell owns the state and the
  // refetch (handleSelectFrom), this component only closes its own field.
  onSelectFrom: (from: CustomFrom) => void;
  // "Your location" row: clears the custom From (handleResetFrom).
  onResetFrom: () => void;
  // "Choose on map" row (handlePickFromOnMap). A stub until Phase 5 wires
  // the map's tap handler: it turns pickingOnMap on and nothing else.
  onPickOnMap: () => void;
  // True while the map tap mode is on. Replaces the From field with a one
  // line prompt below.
  pickingOnMap: boolean;
  // Ends pick mode only, restoring the previous From
  // (handleCancelPickOnMap). Distinct from onCancel above, which ends the
  // whole Directions session -- Phase 5.3 asks for two clearly labeled
  // controls so the two are never confused.
  onCancelPickOnMap: () => void;
  // Voice guidance phase 1: mirrors public-shell.tsx's own
  // voiceMuted/setVoiceMuted/voiceSupported (useVoiceGuidance,
  // use-voice-guidance.ts) one for one. voiceSupported false hides the
  // button entirely (see its use below) rather than showing a control
  // that silently does nothing on a browser with no speechSynthesis.
  voiceMuted: boolean;
  onToggleVoiceMuted: () => void;
  voiceSupported: boolean;
  // Navigation: Start sits at the bottom of the panel. While navigating the
  // panel is not shown at all (the navigation view replaces it).
  navigating: boolean;
  canStartNavigation: boolean;
  // Why Start is unavailable, when the person can fix it. Null when Start is
  // available or is only waiting on a route to load.
  startBlockedReason: "no-location" | "custom-from" | null;
  onStartNavigation: () => void;
  // desktop-directions-panel-phases.md Phase 1.1: the two variants share
  // every prop and every inner row -- only the outer wrapper's
  // positioning and card chrome differ (mobile: viewport-fixed bottom
  // sheet above bottom-nav; desktop: map-relative floating card,
  // bottom-centered in the same row as DiscoverMap's own ZoomControl).
  // Defaults to "mobile" so every existing call site (discover.tsx's
  // mobile render branch) is unaffected by this prop's addition.
  variant?: "mobile" | "desktop";
}

// Turn-by-turn phase 1, human-asked ("let's make the navigation better"):
// one row per OSRM step, instruction sentence (osrm-instructions.ts) plus
// this step's own distance (formatDistance, already used by the duration/
// distance row above). Scrolls inside its own max-height rather than
// growing the panel unbounded -- a long drive across Pasig can have
// dozens of steps, and an unbounded list would push the Cancel/mode row
// off-screen on a short mobile viewport.
//
// All steps render, including the final "arrive" row -- Google's own
// directions list does the same (the destination is its own last step,
// not folded into the preceding one), and RouteStep carries nothing that
// would let this component tell "second-to-last" from "last" more
// cheaply than just rendering every entry in order.
function StepList({ steps }: Readonly<{ steps: RouteStep[] }>) {
  return (
    <ol className="mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-border pt-3">
      {steps.map((step, index) => (
        // index is stable here: `steps` is a fresh array from the latest
        // fetchRoute response each time (directions.ts's readSteps), never
        // reordered or filtered in place, so index doubles safely as the
        // key without a per-step id to key on instead.
        <li key={index} className="flex items-start gap-2 text-sm">
          {stepIcon(step)}
          <span className="min-w-0 flex-1 text-foreground">{formatStepInstruction(step)}</span>
          {step.distance > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDistance(step.distance)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

// Sonar (nested ternary): the loading/error/duration row used to be an
// isLoading ? … : errorReason ? … : … chain inline in the JSX below.
// Same three mutually-exclusive outcomes, same order, now as early
// returns -- the branches were already exclusive (discover.tsx's
// handleSelectMode resolves each fetch to either a success that clears
// errorReason or a caught error that clears isLoading first), so this is
// a shape change only, not a behavior one.
function DirectionsStatusRow({
  isLoading,
  errorReason,
  durationSeconds,
  distanceMeters,
  noOrigin,
}: Readonly<
  Pick<DirectionsPanelProps, "isLoading" | "errorReason" | "durationSeconds" | "distanceMeters"> & {
    noOrigin: boolean;
  }
>) {
  if (isLoading) {
    return <p className="mt-4 text-sm text-muted-foreground">Getting directions…</p>;
  }
  if (errorReason) {
    return <p className="mt-4 text-sm text-destructive">{ERROR_MESSAGES[errorReason]}</p>;
  }
  // No starting point yet: the From row is already the prompt, so this row
  // stays empty instead of saying it twice.
  if (noOrigin) return null;
  // Phase 1.4: time first, then distance, joined by a middle dot -- "12
  // min · 2.4 km" -- per the plan. When either value is null (should only
  // happen transiently, before the first fetch resolves), render whichever
  // exists rather than a lone separator with nothing on one side.
  const duration = durationSeconds === null ? null : formatDuration(durationSeconds);
  const distance = distanceMeters === null ? null : formatDistance(distanceMeters);
  const text = [duration, distance].filter(Boolean).join(" · ");
  return <p className="mt-4 text-sm text-muted-foreground">{text}</p>;
}

// OSRM times are what the road allows with no traffic, and the app has no
// live traffic to correct them with. Said once, under the time, for car only:
// a walk or a ride is not held up by traffic the same way.
export function TrafficNote({ mode }: Readonly<{ mode: TravelMode }>) {
  if (mode !== "car") return null;
  return <p className="mt-1 text-xs text-muted-foreground">Time is an estimate without traffic.</p>;
}

// Alternative routes, as Google Maps lists them: one row per route with its
// time, distance and main road, the fastest first. The selected row has a
// filled background, not a colored edge line (ux-ui-guidelines.md, Style).
// Sorted by time so the order does not change when a pick swaps routes.
function RouteOptions({
  route,
  onSelectRoute,
}: Readonly<{ route: RouteGeometry; onSelectRoute: (alternative: RouteGeometry) => void }>) {
  const options = [route, ...(route.alternatives ?? [])].sort((a, b) => a.duration - b.duration);
  return (
    <ul className="mt-4 flex flex-col gap-1">
      {options.map((option, index) => {
        const selected = option === route;
        const via = viaName(option);
        return (
          <li key={`${index}-${Math.round(option.duration)}-${Math.round(option.distance)}`}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => {
                if (!selected) onSelectRoute(option);
              }}
              className={cn(
                "flex min-h-10 w-full items-center justify-between gap-4 rounded-lg px-4 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                selected ? "bg-muted" : "hover:bg-muted",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{formatDuration(option.duration)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {via ? `Via ${via}, ` : ""}
                  {formatDistance(option.distance)}
                </span>
              </span>
              {index === 0 && <span className="shrink-0 text-xs text-muted-foreground">Fastest</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// directions-distance-and-from-phases.md Phase 4.6: the From row's three
// mutually exclusive states, as early returns rather than a nested ternary
// (same Sonar reason DirectionsStatusRow above gives). Order matters:
// pick mode wins over an open field, since Phase 5 closes the field the
// moment pick mode starts, but a stale editingFrom must never show the
// search field on top of the prompt. Every state is min-h-10 so the panel
// does not jump when the row swaps.
function DirectionsFromRow({
  fromLabel,
  pickingOnMap,
  editingFrom,
  noOrigin,
  onStartEditing,
  onStopEditing,
  onSelectFrom,
  onResetFrom,
  onPickOnMap,
  onCancelPickOnMap,
}: Readonly<{
  fromLabel: string | null;
  pickingOnMap: boolean;
  editingFrom: boolean;
  // No custom From and no live location: nothing to start from yet.
  noOrigin: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSelectFrom: (from: CustomFrom) => void;
  onResetFrom: () => void;
  onPickOnMap: () => void;
  onCancelPickOnMap: () => void;
}>) {
  if (pickingOnMap) {
    // Phase 4 stub, completed in Phase 5.3: the prompt takes the From
    // field's place while pick mode is on. <output> (implicit status
    // role) so a screen reader announces it, same reason the picker's
    // result lines are <output>. The X only ends pick mode and keeps the previous From,
    // and is labeled differently from the panel's Cancel (which ends the
    // whole session) so the two are never confused.
    return (
      <div className="flex min-h-10 items-center gap-2">
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <output className="flex-1 text-sm text-foreground">
          Tap the map to set the start.
        </output>
        <button
          type="button"
          aria-label="Stop choosing on map"
          onClick={onCancelPickOnMap}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="h-5 w-5 shrink-0" />
        </button>
      </div>
    );
  }

  if (editingFrom) {
    return (
      <FromSearch
        hasCustomFrom={fromLabel !== null}
        onSelect={(from) => {
          onSelectFrom(from);
          onStopEditing();
        }}
        onUseMyLocation={() => {
          onResetFrom();
          onStopEditing();
        }}
        // Pick mode replaces the field with the prompt above, so the
        // field closes here too (Phase 4.6).
        onPickOnMap={() => {
          onPickOnMap();
          onStopEditing();
        }}
        onClose={onStopEditing}
      />
    );
  }

  return (
    <button
      type="button"
      // The visible text is only the current value, so the label adds
      // what the control does. Announces both: "Starting point: Pasig
      // City Museum. Change starting point". Also carries the full label
      // for a screen reader when the visible text is truncated.
      aria-label={`Starting point: ${fromLabel ?? (noOrigin ? "not set" : "Your location")}. Change starting point`}
      onClick={onStartEditing}
      className="flex min-h-10 w-full items-center gap-2 rounded-lg text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-muted-foreground" />
      {/* truncate: a long search-pick label ends in an ellipsis instead
          of wrapping and growing the panel. min-w-0 is what lets a flex
          child actually shrink below its content width. */}
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {fromLabel ?? (noOrigin ? "Choose starting point" : "Your location")}
      </span>
    </button>
  );
}

// desktop-directions-panel-phases.md Phase 1.2: the mode row, From/To
// rows, and time/loading/error row are identical between both variants
// -- only the outer wrapper differs (see DirectionsPanel below). Split
// out so that shared content is written once, not copy-pasted into a
// second near-identical return block that would drift the next time one
// copy gets edited and the other doesn't.
const START_BLOCKED_MESSAGES = {
  "no-location": "Turn on location to start.",
  "custom-from": "Start needs your location as the starting point.",
} as const;

function DirectionsPanelContent({
  result,
  selectedMode,
  onSelectMode,
  onCancel,
  durationSeconds,
  distanceMeters,
  steps,
  route,
  onSelectRoute,
  isLoading,
  errorReason,
  fromLabel,
  onSelectFrom,
  onResetFrom,
  onPickOnMap,
  pickingOnMap,
  onCancelPickOnMap,
  voiceMuted,
  onToggleVoiceMuted,
  voiceSupported,
  canStartNavigation,
  startBlockedReason,
  onStartNavigation,
}: Readonly<Omit<DirectionsPanelProps, "variant" | "navigating">>) {
  // directions-distance-and-from-phases.md Phase 4.6: UI-only. Whether the
  // From row is currently swapped for the search field. It does not need
  // to survive a tab switch: the field closes on its own (outside tap,
  // Escape, a pick), so losing it on unmount costs nothing. The custom
  // From itself lives in the shell, not here.
  // With no starting point the field opens on its own: that is the one thing
  // this panel needs from the person.
  const noOrigin = startBlockedReason === "no-location";
  const [editingFrom, setEditingFrom] = useState(noOrigin);
  // A live fix can arrive after the panel opened with no origin. The shell
  // then fetches the route itself, so the open search field is no longer
  // needed. Only the no-origin -> origin change closes it, so a person who
  // opens it on purpose later is not interrupted.
  useEffect(() => {
    if (!noOrigin) setEditingFrom(false);
  }, [noOrigin]);

  return (
    <>
      {/* Phase 3.3: mode row, Car/Bike/Walk in that order per the
          reference image, Cancel (X) at the end. Icon-only buttons, no
          text label -- all four are universally recognized per
          ux-ui-guidelines.md's Icon Rules. Plain <button> elements, not
          the Button component -- Button's size="icon" is a fixed square
          (h-9 w-9), Button's shapes don't include a circular selected
          state, and every mode/Cancel button here needs that exact
          circle shape, so these borrow Button's own bg-primary/
          text-primary-foreground and hover:bg-muted/hover:text-
          foreground tokens directly rather than fighting the component's
          own rounded-md default. Selected state: filled circle behind
          the icon (bg-primary), not a colored border line, which the
          style rules ban outright. Unselected: no background until
          hover, matching the `ghost` variant's own token pair. */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {MODES.map(({ mode, label, icon: Icon }) => {
            const selected = mode === selectedMode;
            // Phase 6.3: a not-yet-selected mode is disabled while a
            // different mode's fetch is in flight -- 5.3's guard already
            // ignores a second tap on discover.tsx's side, this just
            // makes that same rule visible rather than leaving a tap
            // silently do nothing (ux-ui-guidelines.md's Disabled/gated
            // rule: never a silently dead control). The mode currently
            // loading stays enabled-looking but selected is unaffected
            // until the fetch resolves, since it's already the active
            // selection, not a new one being requested.
            // No starting point: a mode tap would have nothing to route from.
            const disabled = (isLoading || noOrigin) && !selected;
            return (
              <button
                key={mode}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onSelectMode(mode)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  disabled && "opacity-40 hover:bg-transparent hover:text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          {/* Voice guidance phase 1: hidden entirely rather than shown
              disabled when this browser has no speechSynthesis (see
              voiceSupported's own doc comment on DirectionsPanelProps
              above) -- a control that can never do anything is worse than
              no control. */}
          {voiceSupported && (
            <button
              type="button"
              aria-label={voiceMuted ? "Unmute voice guidance" : "Mute voice guidance"}
              aria-pressed={voiceMuted}
              onClick={onToggleVoiceMuted}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {voiceMuted ? (
                <SpeakerX className="h-5 w-5 shrink-0" />
              ) : (
                <SpeakerHigh className="h-5 w-5 shrink-0" />
              )}
            </button>
          )}
          <button
            type="button"
            aria-label="Cancel"
            onClick={onCancel}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5 shrink-0" />
          </button>
        </div>
      </div>

      {/* Phase 3.4/3.5: From/To rows, stacked, matching the reference
          image's circle-then-pin marker pair.
          directions-distance-and-from-phases.md Phase 4.6: From used to
          be static "Your location" text. It is now a button that swaps
          for FromSearch (Google Maps' own in-place edit: tap the
          starting point, type, pick). To stays plain text, since the
          destination is the result being viewed (plan, Scope).
          Three mutually exclusive From states, same row height in each
          (min-h-10) so the panel does not jump between them: the
          button, the open field, and the map-pick prompt.
          gap-2/mt-4 throughout (8px grid, ux-ui-guidelines.md's Spacing
          Rules), not gap-3/mt-3 -- 12px isn't a valid grid step, only
          4px is allowed as the one tight-space exception. */}
      <div className="mt-4 flex flex-col gap-2">
        <DirectionsFromRow
          fromLabel={fromLabel}
          pickingOnMap={pickingOnMap}
          editingFrom={editingFrom}
          noOrigin={noOrigin}
          onStartEditing={() => setEditingFrom(true)}
          onStopEditing={() => setEditingFrom(false)}
          onSelectFrom={onSelectFrom}
          onResetFrom={onResetFrom}
          onPickOnMap={onPickOnMap}
          onCancelPickOnMap={onCancelPickOnMap}
        />
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-foreground">{result.name}</p>
        </div>
      </div>

      {/* Phase 6.1/6.2: loading and error both take over this row --
          they're mutually exclusive with the duration and with each
          other (isLoading can't be true at the same time errorReason is
          set; discover.tsx's handleSelectMode always resolves one fetch
          to either a success, clearing errorReason, or a caught error,
          clearing isLoading first). Error text reuses result-card.tsx's
          own destructive-text treatment (text-destructive) so a routing
          failure reads the same way in both surfaces, not a panel-
          specific color introduced for this one row. */}
      {/* Alternative routes replace the single time and distance row when
          OSRM returned more than one route, since the selected row already
          carries both numbers. Loading and error still win, same
          mutual exclusion as above. */}
      {!isLoading && !errorReason && route && (route.alternatives?.length ?? 0) > 0 ? (
        <RouteOptions route={route} onSelectRoute={onSelectRoute} />
      ) : (
        <DirectionsStatusRow
          isLoading={isLoading}
          errorReason={errorReason}
          durationSeconds={durationSeconds}
          distanceMeters={distanceMeters}
          noOrigin={noOrigin}
        />
      )}
      {!isLoading && !errorReason && !noOrigin && <TrafficNote mode={selectedMode} />}

      {/* Turn-by-turn phase 1: only once a route has actually loaded --
          same mutual-exclusion the status row above relies on (isLoading
          and errorReason are never both/either true alongside a populated
          steps list, directions.ts's fetchRoute/useDirectionsState only
          ever set one of the three at a time). A route with no steps
          (service omitted them, or readSteps' shape check in directions.ts
          rejected a malformed response) renders nothing extra here -- the
          duration/distance row above already covers that case. */}
      {!isLoading && !errorReason && steps && steps.length > 0 && <StepList steps={steps} />}

      {/* Navigation: the one primary action, at the bottom of the panel.
          Disabled (visibly, with the reason when the person can fix it)
          until a route with steps is loaded and the live position is the
          starting point. */}
      <div className="mt-4">
        <Button className="min-h-10 w-full" disabled={!canStartNavigation} onClick={onStartNavigation}>
          Start
        </Button>
        {startBlockedReason && (
          <p className="mt-2 text-xs text-muted-foreground">{START_BLOCKED_MESSAGES[startBlockedReason]}</p>
        )}
      </div>
    </>
  );
}

export function DirectionsPanel({
  variant = "mobile",
  navigating,
  ...contentProps
}: Readonly<DirectionsPanelProps>) {
  if (navigating) return null;
  if (variant === "desktop") {
    // desktop-directions-panel-phases.md Phase 1.1: `absolute`, not
    // `fixed` -- this renders inside DiscoverMap's own relatively-
    // positioned container (Phase 2.3), the same coordinate space
    // ZoomControl and MapCornerControls already use, not the viewport.
    // bottom-6/centered puts it in the same row as ZoomControl
    // (bottom-6 right-3) without overlapping it, per direct instruction
    // ("same row, don't move the zoom control") -- centered horizontally
    // means it also never reaches MapCornerControls' top-right corner,
    // so neither existing control needs to shift for this one to appear.
    // w-80 matches DesktopShell's own search panel width for visual
    // consistency between the app's two floating side panels; height is
    // auto (content-sized), not h-svh -- a full-height strip for ~200px
    // of actual content would leave the "more than 30% empty is too
    // large" sizing rule badly broken, which right-docked-full-height
    // was rejected for. rounded-2xl/border-input/bg-card/shadow matches
    // ZoomControl/MapCornerControls' own floating-map-chrome convention
    // exactly (not mobile's border-border/shadow-md pairing), so this
    // reads as a sibling of the map's existing controls, not a
    // transplanted mobile component.
    return (
      <div className="absolute bottom-6 left-1/2 z-[1000] w-80 -translate-x-1/2 rounded-2xl border border-input bg-card p-4 shadow">
        <DirectionsPanelContent {...contentProps} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        // z-30, below the shell header (z-40): the header grows over the map
        // when the filters are dragged down, and this panel is portaled to
        // <body>, so a higher value painted it over the open filters.
        "fixed inset-x-0 bottom-16 z-30",
        "mx-auto w-full max-w-md px-4 pb-2",
      )}
    >
      <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
        <DirectionsPanelContent {...contentProps} />
      </div>
    </div>
  );
}
