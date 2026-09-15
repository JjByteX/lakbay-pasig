import { Car, Bike, Footprints, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DirectionsErrorReason, TravelMode } from "@/lib/directions";
import type { DiscoverResult } from "@/lib/discover-types";

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
  { mode: "bike", label: "Bike", icon: Bike },
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
function formatDuration(seconds: number): string {
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
const ERROR_MESSAGES: Record<DirectionsErrorReason, string> = {
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
  // Phase 6.1: true while a mode tap's fetchRoute is in flight
  // (discover.tsx's modeLoading, already tracked since 5.3's single-
  // flight guard -- reused here rather than a second loading flag).
  isLoading: boolean;
  // Phase 6.2: set by discover.tsx when a mode-switch fetch throws,
  // cleared on the next successful fetch or a fresh Directions tap. Null
  // means no error to show -- the normal duration or loading row renders
  // instead.
  errorReason: DirectionsErrorReason | null;
  // desktop-directions-panel-phases.md Phase 1.1: the two variants share
  // every prop and every inner row -- only the outer wrapper's
  // positioning and card chrome differ (mobile: viewport-fixed bottom
  // sheet above bottom-nav; desktop: map-relative floating card,
  // bottom-centered in the same row as DiscoverMap's own ZoomControl).
  // Defaults to "mobile" so every existing call site (discover.tsx's
  // mobile render branch) is unaffected by this prop's addition.
  variant?: "mobile" | "desktop";
}

// desktop-directions-panel-phases.md Phase 1.2: the mode row, From/To
// rows, and time/loading/error row are identical between both variants
// -- only the outer wrapper differs (see DirectionsPanel below). Split
// out so that shared content is written once, not copy-pasted into a
// second near-identical return block that would drift the next time one
// copy gets edited and the other doesn't.
function DirectionsPanelContent({
  result,
  selectedMode,
  onSelectMode,
  onCancel,
  durationSeconds,
  isLoading,
  errorReason,
}: Readonly<Omit<DirectionsPanelProps, "variant">>) {
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
            const disabled = isLoading && !selected;
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
        <button
          type="button"
          aria-label="Cancel"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5 shrink-0" />
        </button>
      </div>

      {/* Phase 3.4/3.5: From/To rows, stacked, matching the reference
          image's circle-then-pin marker pair. From is never editable --
          the plan's own Scope section fixes it to "Your location," no
          swap control, so this is static text, not an input.
          gap-2/mt-4 throughout (8px grid, ux-ui-guidelines.md's Spacing
          Rules), not gap-3/mt-3 -- 12px isn't a valid grid step, only
          4px is allowed as the one tight-space exception. */}
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-muted-foreground" />
          <p className="text-sm text-foreground">Your location</p>
        </div>
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
      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Getting directions…</p>
      ) : errorReason ? (
        <p className="mt-4 text-sm text-destructive">{ERROR_MESSAGES[errorReason]}</p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {durationSeconds !== null ? formatDuration(durationSeconds) : ""}
        </p>
      )}
    </>
  );
}

export function DirectionsPanel({
  variant = "mobile",
  ...contentProps
}: Readonly<DirectionsPanelProps>) {
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
        "fixed inset-x-0 bottom-16 z-50",
        "mx-auto w-full max-w-md px-4 pb-2",
      )}
    >
      <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
        <DirectionsPanelContent {...contentProps} />
      </div>
    </div>
  );
}
