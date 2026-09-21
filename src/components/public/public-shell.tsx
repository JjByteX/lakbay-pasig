import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  User as UserIcon,
  Settings as SettingsIcon,
  LogOut,
  ArrowLeftRight,
  Home as HomeIcon,
} from "lucide-react";
import { BottomNav } from "./bottom-nav";
import { PublicSidebar } from "./public-sidebar";
import { GlobalSearchBar } from "./global-search-bar";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { Coordinates } from "@/lib/discover-query";
import type { DiscoverResult } from "@/lib/discover-types";
import {
  DirectionsError,
  fetchRoute,
  type DirectionsErrorReason,
  type RouteGeometry,
  type TravelMode,
} from "@/lib/directions";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AVATAR_SIZE } from "@/lib/avatar-storage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutDialog } from "@/components/sign-out-dialog";
import { useAuthModal } from "@/lib/auth-modal";
import logo from "@/assets/lakbay-pasig-logo.svg";

// Global search: shell-owned per the resolved spec ("shared query state
// lives in the shell, not per-page, so it persists across tab switches"),
// visible on Home, Trails, Discover, Saved -- not Profile, per the same
// spec. The shell renders GlobalSearchBar into its own top bar directly
// and exposes the committed query text through this context so Discover's
// page (the one tab whose own list/map filtering needs the live text, per
// discover-query.ts's filterDiscoverResults) can read it without a second
// input or a second piece of state duplicating this one.
//
// This replaces the prior per-page TopBarSlotContext (a page pushed its
// own ReactNode into the shell): that slot only ever had one caller
// (discover.tsx) and held rendered content, not state, so it could not
// survive a tab unmount the way the resolved spec now requires. No other
// file referenced useTopBarSlot besides discover.tsx (grepped before
// removing it), so this is a full replacement, not an addition alongside
// the old mechanism, per constraints.md's No Silent Overrides rule --
// flagged here rather than left as silent drift.
interface GlobalSearchContextValue {
  query: string;
  setQuery: (query: string) => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | undefined>(
  undefined,
);

/** Lets a page (Discover) read/clear the shell's shared search query. */
export function useGlobalSearchQuery() {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx)
    throw new Error("useGlobalSearchQuery must be used within PublicShell");
  return ctx;
}

// Live location: shell-owned for the same reason GlobalSearchContext is --
// a page-local useState is destroyed on unmount, so navigating off
// Discover and back used to mean losing the last known position and
// starting over from a fresh one-shot read. Moved up so the position (and
// the live watch producing it) survives every tab switch, matching how
// Google Maps keeps tracking your position while you use other parts of
// the app around an open route.
//
// This also changes *how* the position is produced, not just where it's
// stored: navigator.geolocation.watchPosition instead of a single
// getCurrentPosition call. getCurrentPosition resolves once and never
// updates again, so a tourist who starts walking drifts away from their
// own blue dot and a mid-route "From" point that no longer matches where
// they actually are. watchPosition keeps a callback registered with the
// device's location provider and re-fires it on every fix, so
// userLocation tracks real movement the whole time the shell is mounted
// (effectively the whole session, since PublicShell wraps every public
// route) -- not just once at Discover's first mount.
//
// The subscription itself is owned entirely here, one instance for the
// whole shell: PublicShell's own mount/unmount is the only lifecycle that
// starts or stops it, so switching tabs (which merely swaps what's
// rendered inside the shell, not the shell itself) never tears down and
// re-subscribes the watch. clearWatch runs in this effect's own cleanup,
// which only fires on the shell's unmount (session end / full page
// leave), so there is exactly one active GPS subscription for as long as
// the person is using the app, not a growing pile of forgotten ones.
interface UserLocationContextValue {
  userLocation: Coordinates | null;
  setUserLocation: (coords: Coordinates) => void;
}

const UserLocationContext = createContext<UserLocationContextValue | undefined>(
  undefined,
);

/** Reads the shell's continuously-tracked location, and lets a page (the
 *  map's own locate-me control) push a fresher reading in directly. */
export function useUserLocation() {
  const ctx = useContext(UserLocationContext);
  if (!ctx) throw new Error("useUserLocation must be used within PublicShell");
  return ctx;
}

// directions-distance-and-from-phases.md Phase 2.1: the custom From shape,
// defined once here since the shell owns the state and three files
// consume it (discover-map.tsx, result-card.tsx, discover-list.tsx, via
// the `origin` field below). `Coordinates` is reused from
// discover-query.ts, not redeclared -- same point shape GPS and OSRM
// already use.
export interface CustomFrom {
  label: string;
  coordinates: Coordinates;
}

// Phase 5.1: display-only label for a From picked by tapping empty map. No
// reverse lookup (plan, Decisions): nothing reads it back, and Photon's
// street field is patchy (decision #21).
const MAP_PICK_LABEL = "Pinned location";

// Directions: shell-owned for the same reason as the two above. This used
// to be six separate useState calls inside discover.tsx (route,
// directionsPanelResult, selectedMode, routeDuration, modeLoading,
// modeErrorReason) plus the two handlers that drive them
// (handleSelectMode, handleCancelDirections) -- all destroyed the moment
// DiscoverPage unmounted, so leaving Discover mid-route (to check Saved,
// answer a notification, anything) silently cancelled the trip a tourist
// was mid-way through following. Moved here verbatim: same six fields,
// same two handlers, same fetchRoute call, same DirectionsError handling
// -- only the *location* of the state changed, not its shape or logic.
// discover.tsx now reads this context instead of declaring its own copy.
interface DirectionsContextValue {
  route: RouteGeometry | null;
  directionsPanelResult: DiscoverResult | null;
  selectedMode: TravelMode;
  routeDuration: number | null;
  // directions-distance-and-from-phases.md Phase 1.3: road distance
  // (meters) for the currently selected mode, alongside routeDuration --
  // same source (RouteGeometry, fetchRoute), same lifecycle (set on
  // route-found and mode-switch success, cleared on cancel).
  routeDistance: number | null;
  modeLoading: boolean;
  modeErrorReason: DirectionsErrorReason | null;
  // directions-distance-and-from-phases.md Phase 2.2: a person-chosen
  // route start, overriding the live GPS fix for routing only. null means
  // "no custom From set", the common case -- origin below then falls back
  // to userLocation.
  customFrom: CustomFrom | null;
  // Phase 2.4: true while the map-tap-to-set-From mode (Phase 5) is
  // active. Lives here rather than as page-local state so Cancel (this
  // context's own handleCancelDirections) can always turn it off, no
  // matter which page/component turned it on.
  pickingOnMap: boolean;
  // Phase 2.2: the actual route start -- customFrom's coordinates when
  // set, else the live userLocation. Derived once, here, and exposed
  // alongside customFrom so every consumer (ResultCard in Phase 3,
  // discover-map.tsx, discover-list.tsx) reads the same value instead of
  // each re-deriving `customFrom?.coordinates ?? userLocation` and
  // risking the two falling out of sync.
  origin: Coordinates | null;
  handleRouteFound: (geometry: RouteGeometry, foundResult: DiscoverResult) => void;
  handleSelectMode: (mode: TravelMode) => Promise<void>;
  handleCancelDirections: () => void;
  // Phase 2.4: sets customFrom, leaves pickingOnMap off (a search pick and
  // a map pick are different entry points; picking on the map turns
  // itself off separately, see handlePickFromOnMap/discover-map.tsx),
  // and refetches the current route for the new origin.
  handleSelectFrom: (from: CustomFrom) => Promise<void>;
  // Phase 2.4: clears customFrom and refetches from userLocation. With no
  // GPS fix, there is no origin to fetch from, so this clears the route
  // instead of calling fetchRoute with a null origin.
  handleResetFrom: () => Promise<void>;
  // Phase 2.4: turns pickingOnMap on. Setting the From value itself
  // happens later, in Phase 5's map click handler, via handleSelectFrom.
  handlePickFromOnMap: () => void;
  // Phase 2.7: turns pickingOnMap off without touching customFrom, for
  // Escape / the panel's Cancel control while picking is active. Named
  // separately from handleCancelDirections, which cancels the whole
  // Directions session, not just an in-progress pick.
  handleCancelPickOnMap: () => void;
  // directions-distance-and-from-phases.md Phase 5.1: called by the map's
  // tap handler (discover-map.tsx) with the tapped point. Lives here, not
  // in the map file, so the "Pinned location" label string exists in one
  // place. `name` is optional (open-questions.md Resolved #9): a tap on a
  // place marker passes that place's own name, since it is already known
  // data, and a tap on empty map passes none and gets the generic label.
  // Same path as a search pick from there on (handleSelectFrom).
  handleMapPick: (coordinates: Coordinates, name?: string) => Promise<void>;
}

const DirectionsContext = createContext<DirectionsContextValue | undefined>(
  undefined,
);

/** Reads the shell's own in-progress Directions session (route, selected
 *  mode, duration, distance, custom From, loading/error state) and its
 *  mutating actions. Used by discover.tsx and, through it,
 *  DirectionsPanel/DiscoverMap/DiscoverList/ResultCard -- none of which
 *  own this state themselves anymore. */
export function useDirections() {
  const ctx = useContext(DirectionsContext);
  if (!ctx) throw new Error("useDirections must be used within PublicShell");
  return ctx;
}

/** Owns the Directions session's state and actions, exactly as discover.tsx
 *  used to -- moved here as its own hook (not inlined into PublicShell)
 *  purely to keep PublicShell itself readable, same reasoning the existing
 *  MobileShell/DesktopShell split already follows for markup. */
function useDirectionsState(userLocation: Coordinates | null): DirectionsContextValue {
  const [route, setRoute] = useState<RouteGeometry | null>(null);
  const [directionsPanelResult, setDirectionsPanelResult] =
    useState<DiscoverResult | null>(null);
  const [selectedMode, setSelectedMode] = useState<TravelMode>("foot");
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [modeLoading, setModeLoading] = useState(false);
  const [modeErrorReason, setModeErrorReason] =
    useState<DirectionsErrorReason | null>(null);
  // directions-distance-and-from-phases.md Phase 2.2: null (no custom
  // From) is the common case -- origin then falls back to userLocation.
  const [customFrom, setCustomFrom] = useState<CustomFrom | null>(null);
  // Phase 2.4: on while the map-tap-to-pick-From mode (Phase 5) is active.
  const [pickingOnMap, setPickingOnMap] = useState(false);

  // Phase 2.2: derived once here so ResultCard (Phase 3), discover-map.tsx
  // and discover-list.tsx all read the same value instead of each
  // re-deriving `customFrom?.coordinates ?? userLocation` separately.
  const origin = customFrom?.coordinates ?? userLocation;

  // Phase 2.5: a request counter, same idea as the location picker's
  // searchSeq. A From change and a mode switch both call fetchRoute, and
  // either can be slow -- only the response matching the *latest* call
  // may write route/duration/distance/error. Bumped on every fetch start
  // and on Cancel, so a late response after Cancel can't redraw a route
  // the person already closed.
  const fetchSeqRef = useRef(0);

  // Phase 2.3: the fetch handleSelectMode already did, factored out so
  // handleSelectFrom/handleResetFrom (Phase 2.4) share it instead of a
  // second copy drifting from this one. Takes the mode and origin
  // explicitly rather than reading them from closure, since From handlers
  // call this with a not-yet-committed origin (the mode stays whatever it
  // already was -- these handlers never change selectedMode).
  //
  // Returns whether the fetch actually landed (true) or was skipped/
  // superseded/failed (false), so handleSelectMode -- the only caller that
  // commits selectedMode -- can commit it on success only, matching the
  // pre-Phase-2 behavior exactly (plan/phase spec, 2.3: "only sets
  // selectedMode on success").
  const refetch = useCallback(
    async (mode: TravelMode, from: Coordinates, destination: DiscoverResult): Promise<boolean> => {
      if (destination.latitude == null || destination.longitude == null) return false;
      const seq = ++fetchSeqRef.current;
      setModeLoading(true);
      setModeErrorReason(null);
      try {
        const geometry = await fetchRoute(
          from,
          { latitude: destination.latitude, longitude: destination.longitude },
          mode,
        );
        if (seq !== fetchSeqRef.current) return false; // superseded by a newer fetch or a Cancel
        setRoute(geometry);
        setRouteDuration(geometry.duration);
        setRouteDistance(geometry.distance);
        return true;
      } catch (err) {
        if (seq !== fetchSeqRef.current) return false;
        setModeErrorReason(err instanceof DirectionsError ? err.reason : "network");
        return false;
      } finally {
        if (seq === fetchSeqRef.current) setModeLoading(false);
      }
    },
    [],
  );

  const handleRouteFound = useCallback(
    (geometry: RouteGeometry, foundResult: DiscoverResult) => {
      // Phase 2.6: receives a route already fetched from the current
      // origin (ResultCard fetches it, not this handler), so this only
      // stores the result -- it must not refetch. It also must not touch
      // customFrom: a new Directions tap keeps whatever From the person
      // already set: only Cancel clears it (plan, Notes).
      setRoute(geometry);
      setDirectionsPanelResult(foundResult);
      setSelectedMode("foot");
      setRouteDuration(geometry.duration);
      setRouteDistance(geometry.distance);
      setModeErrorReason(null);
    },
    [],
  );

  const handleSelectMode = useCallback(
    async (mode: TravelMode) => {
      // Phase 2.3: guard changed from !userLocation to !origin, so a
      // custom From (no GPS needed) still allows a mode switch.
      if (modeLoading || !origin || !directionsPanelResult) return;
      if (mode === selectedMode) return;
      const ok = await refetch(mode, origin, directionsPanelResult);
      // Mode only commits on a successful fetch -- same rule the pre-
      // Phase-2 version enforced by setting it inside the try block.
      // refetch itself never touches selectedMode: the From handlers
      // reuse it without changing mode, per Phase 2.3.
      if (ok) setSelectedMode(mode);
    },
    [modeLoading, origin, directionsPanelResult, selectedMode, refetch],
  );

  const handleCancelDirections = useCallback(() => {
    fetchSeqRef.current++; // invalidate any fetch still in flight
    // Bumping the counter also disarms that fetch's own `finally`, which
    // only clears modeLoading while its seq is still current. So the flag
    // has to be cleared here, or a Cancel mid-fetch would leave it stuck
    // true and the next Directions session would show "Getting
    // directions…" forever with every mode tap ignored.
    setModeLoading(false);
    setRoute(null);
    setDirectionsPanelResult(null);
    setSelectedMode("foot");
    setRouteDuration(null);
    setRouteDistance(null);
    setModeErrorReason(null);
    setCustomFrom(null);
    setPickingOnMap(false);
  }, []);

  const handleSelectFrom = useCallback(
    async (from: CustomFrom) => {
      setCustomFrom(from);
      setPickingOnMap(false);
      if (!directionsPanelResult) return; // no active session to reroute yet
      await refetch(selectedMode, from.coordinates, directionsPanelResult);
    },
    [directionsPanelResult, selectedMode, refetch],
  );

  const handleResetFrom = useCallback(async () => {
    setCustomFrom(null);
    if (!directionsPanelResult) return;
    if (!userLocation) {
      // No GPS fix to fall back to: there is no origin, so clear the
      // route instead of calling fetchRoute with one. The panel's
      // existing no-location state takes over from here.
      fetchSeqRef.current++;
      setModeLoading(false); // same reason as handleCancelDirections above
      setRoute(null);
      setRouteDuration(null);
      setRouteDistance(null);
      setModeErrorReason(null);
      return;
    }
    await refetch(selectedMode, userLocation, directionsPanelResult);
  }, [directionsPanelResult, userLocation, selectedMode, refetch]);

  const handlePickFromOnMap = useCallback(() => {
    setPickingOnMap(true);
  }, []);

  const handleCancelPickOnMap = useCallback(() => {
    setPickingOnMap(false);
  }, []);

  // Phase 5.1: the one place the map-tap label is decided. Delegates to
  // handleSelectFrom, which also turns pickingOnMap off and refetches, so a
  // map pick and a search pick cannot drift apart. No coordinate rounding:
  // nothing is stored, and the route origin does not need it (Phase 5.2).
  const handleMapPick = useCallback(
    (coordinates: Coordinates, name?: string) =>
      handleSelectFrom({ label: name ?? MAP_PICK_LABEL, coordinates }),
    [handleSelectFrom],
  );

  return {
    route,
    directionsPanelResult,
    selectedMode,
    routeDuration,
    routeDistance,
    modeLoading,
    modeErrorReason,
    customFrom,
    pickingOnMap,
    origin,
    handleRouteFound,
    handleSelectMode,
    handleCancelDirections,
    handleSelectFrom,
    handleResetFrom,
    handlePickFromOnMap,
    handleCancelPickOnMap,
    handleMapPick,
  };
}

// Discover-only drag-reveal filters (Map/List, Category, Price), fused into
// the same header element as the search bar so a drag on the handle moves
// one continuous block, not two separately positioned elements.
//
// A page opts in by calling `useDiscoverFilters(content)`. When `content` is
// null (every page but Discover), the header renders exactly as before: no
// handle, no extra height, no drag capability. Global by mechanism (the
// header owns the drag), Discover-only by content -- disabled everywhere
// else simply because nothing else ever sets it.
const DiscoverFiltersContext = createContext<
  ((content: ReactNode | null) => void) | undefined
>(undefined);

/** Registers content to render inside the shell header's drag-reveal area.
 *  Pass `null` (or unmount) to hand the header back to its plain state. */
export function useDiscoverFilters(content: ReactNode | null) {
  const setFilters = useContext(DiscoverFiltersContext);
  if (!setFilters)
    throw new Error("useDiscoverFilters must be used within PublicShell");
  useEffect(() => {
    setFilters(content);
    return () => setFilters(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, setFilters]);
}

const SNAP_OPEN_RATIO = 0.35; // drag past 35% of the filter stack's height snaps open on release

/** Drag-reveal area for the header's filter content: grows from 0 to its
 *  own intrinsic height as the handle is dragged down, as a normal-flow
 *  block inside the header -- not a separate absolutely-positioned layer,
 *  so it and the search row above it are one continuous element that
 *  moves and resizes as a unit. Renders nothing (no handle, no space) when
 *  there's no filter content registered. */
function HeaderFilterArea({
  content,
}: Readonly<{ content: ReactNode | null }>) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [measured, setMeasured] = useState(false);

  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ pointerY: number; startOffset: number } | null>(
    null,
  );

  // Re-runs on every `content` change, not just on mount: `content` is
  // null on PublicShell's first render (Discover's own useDiscoverFilters
  // effect hasn't fired yet at that point), so this component's very
  // first mount always hits the early `if (!content) return null` below
  // -- contentRef's ref never attaches to anything, and a mount-only
  // (`[]`-deps) effect here would find `contentRef.current` permanently
  // null and never get a second chance to attach the observer once real
  // content (and the ref) actually show up. Keying this effect on
  // `content` instead makes it re-attempt the observer setup the moment
  // content becomes non-null, which is also when the ref-bearing JSX
  // below first renders.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContentHeight(entries[0]?.contentRect.height ?? 0);
      setMeasured(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [content]);

  const clamp = useCallback(
    (value: number) => Math.min(Math.max(value, 0), contentHeight),
    [contentHeight],
  );

  // Collapse instantly (no snap animation, no stale offset) if the page
  // hands the header back to its plain state mid-open, e.g. navigating
  // away from Discover while the filters are showing.
  useEffect(() => {
    if (content) return;
    offsetRef.current = 0;
    setOffset(0);
    setMeasured(false);
  }, [content]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartRef.current = {
        pointerY: e.clientY,
        startOffset: offsetRef.current,
      };
      setDragging(true);
    },
    [],
  );

  useEffect(() => {
    if (!dragging) return;

    function handleMove(e: PointerEvent) {
      const start = dragStartRef.current;
      if (!start) return;
      const next = clamp(start.startOffset + (e.clientY - start.pointerY));
      offsetRef.current = next;
      setOffset(next);
    }

    function handleUp() {
      dragStartRef.current = null;
      setDragging(false);
      const settled =
        offsetRef.current > contentHeight * SNAP_OPEN_RATIO ? contentHeight : 0;
      offsetRef.current = settled;
      setOffset(settled);
    }

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleUp);
    };
  }, [dragging, clamp, contentHeight]);

  if (!content) return null;

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        className={`relative overflow-hidden ${dragging ? "" : "transition-[height] duration-200 ease-out"}`}
        style={{ height: measured ? offset : 0 }}
      >
        {/* Rendered at its natural height (position: absolute takes it out
            of flow, so it never gets squashed by the clipped wrapper
            above), so the ResizeObserver on contentRef always measures the
            content's real, unclipped height -- previously contentRef sat
            directly inside the height-clipped wrapper, which starts at
            0px, so every measurement came back 0 and the drag had nothing
            to reveal. */}
        <div ref={contentRef} className="absolute inset-x-0 top-0">
          {content}
        </div>
      </div>
      <button
        type="button"
        aria-label="Drag to show search filters"
        aria-expanded={contentHeight > 0 && offset > contentHeight * 0.5}
        onPointerDown={handlePointerDown}
        className="flex h-6 w-full touch-none items-center justify-center"
      >
        <span className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
      </button>
    </div>
  );
}

// Tabs the search bar appears on, per the resolved spec. Profile is a full
// account-settings page the person scrolls through, not a lookup surface,
// same reasoning navigation-and-access-control.md already gives Home for
// staying passive -- explicitly excluded rather than defaulting it in.
// "/events" is included even though it isn't one of the bottom-nav tabs:
// App.tsx nests events/:id directly under the shell at the top
// level (not under any tab's own path prefix), reached from Home's
// AnnouncementCarousel's tile click, so it's still part of the Home surface the
// search bar should stay mounted across, same reasoning as the trails/
// discover/saved detail-route case below.
const SEARCH_VISIBLE_PATHS = ["/", "/trails", "/discover", "/saved", "/events"];

function isSearchVisible(pathname: string): boolean {
  // Trails/Discover/Saved/Events detail routes (e.g. /trails/:id) nest
  // under the same tab or the same shell-level surface; the search bar
  // stays mounted across a drill-down the same way the bottom nav already
  // does, rather than disappearing the moment someone opens a detail page
  // reached from a search result. "/" matches Home's own index route
  // exactly; it never prefix-matches every other path since the `path ===
  // "/"` branch and the `startsWith` branch are both keyed per entry, not
  // a bare leading-slash check.
  return SEARCH_VISIBLE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

// Account menu: top-right circle, beside search, per direct instruction.
// Replaces Profile's bottom-nav tab entirely (bottom-nav.tsx), so this is
// now the only way to reach Profile, Settings, or Sign out -- one entry
// point, not a shortcut alongside a still-existing tab, per ux-ui-
// guidelines.md's "one action, one trigger, one place." Guest still gets
// the trigger (a plain UserIcon, no initial to show), opening a menu with
// a single "Sign in" item -- Profile/Settings/Sign out are session-gated
// concepts and are hidden entirely rather than shown disabled, matching
// admin-panel-spec.md's Access Rule pattern of hiding what doesn't apply
// rather than greying it out. Signed-in shows the same circle with the
// display-name initial (Avatar/AvatarFallback, already used this same way
// by admin-sidebar.tsx -- reused, not a new pattern) since there is no
// profile-picture field in the data model to show a real photo. Trigger
// gets its own flex-center + p-0 + leading-none: Radix's DropdownMenuTrigger
// renders a plain <button>, which carries default button line-height/
// padding that pushes a single text character (the initial) off true
// center inside the circle even though AvatarFallback's own flex centering
// is correct -- the same leading-none is applied on AvatarFallback too, so
// both the guest's icon and the signed-in initial sit dead center
// regardless of which one renders. shadow-sm matches the search Input's
// own shadow-sm and the logo circle's, so both circles read as lifted off
// the header the same amount the search bar already is, not a mismatched
// third depth on this same row. "Profile" and "Settings" labels/
// destinations match profile.tsx's own Settings link row and page title
// exactly, no synonym introduced for either concept. A staff/admin account
// also gets an "Admin View"/"Staff View" item (/admin) between Settings
// and Home Page -- see that item's own comment below.
function AccountMenu() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const { openAuth } = useAuthModal();
  const initial = profile?.display_name?.[0]?.toUpperCase();
  // Log-out confirmation: "Sign out" no longer calls signOut directly,
  // it opens SignOutDialog (owns the actual signOut() call), same
  // pattern as profile.tsx's Sign out button. See sign-out-dialog.tsx.
  const [signOutOpen, setSignOutOpen] = useState(false);

  if (!session) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0 leading-none shadow-sm"
          aria-label="Account menu"
        >
          <Avatar className={AVATAR_SIZE.md}>
            <AvatarFallback className="leading-none">
              <UserIcon className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* landing-hero-phases.md Phase 7.1: opens the shared auth
              popup in place instead of navigating away to /login, so
              whatever the guest was looking at (a Discover result, an
              open filter panel) is still there once they're signed in. */}
          <DropdownMenuItem onClick={() => openAuth("login")}>
            Sign in
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0 leading-none shadow-sm"
          aria-label="Account menu"
        >
          {/* Phase 6.5/6.6/6.8: AvatarImage renders profile.profile_picture
              when set; the initial/UserIcon AvatarFallback below is
              unchanged for a signed-in profile with no uploaded picture
              -- Radix's Avatar already falls back automatically on a
              missing/broken src. Size now reads from avatar-storage.ts's
              shared AVATAR_SIZE.md instead of a locally hardcoded h-9
              w-9, matching this same file's guest branch above. */}
          <Avatar className={AVATAR_SIZE.md}>
            {profile?.profile_picture && <AvatarImage src={profile.profile_picture} alt="" />}
            <AvatarFallback className="leading-none">
              {initial ?? <UserIcon className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate("/profile")}>
            <UserIcon className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/profile/settings")}>
            <SettingsIcon className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          {/* View switcher, staff/admin accounts only: same session, same
              account, just "/admin" instead of "/" -- not a role change,
              staff_role/system_permission are untouched, only the URL
              changes. Same item/reasoning as public-sidebar.tsx's desktop
              counterpart, mirrored here for the mobile header menu. Hidden
              entirely for a resident with no staff_role, matching this
              codebase's existing "hide what doesn't apply" rule. */}
          {profile?.staff_role && (
            <DropdownMenuItem onClick={() => navigate("/admin")}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              {profile.staff_role === "admin" ? "Admin" : "Staff"} View
            </DropdownMenuItem>
          )}
          {/* Home Page: takes a signed-in user back to the landing page
              (/welcome, landing.tsx) -- distinct from "Home" the bottom-
              nav/sidebar tab (bottom-nav.tsx, public-sidebar.tsx's own
              NAV_ITEMS), which is the "/" feed. Landing now has its own
              top nav with a "Go to Dashboard" way back into the app
              (landing.tsx's NavAction), so this is a real round trip, not
              a dead end. */}
          <DropdownMenuItem onClick={() => navigate("/welcome")}>
            <HomeIcon className="mr-2 h-4 w-4" />
            Home Page
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSignOutOpen(true)}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  );
}

// Mobile shell: fixed top header (logo/search/account) + drag-reveal
// filter area + fixed bottom nav, unchanged from before the desktop
// sidebar existed. Split out from PublicShell verbatim so the branch
// below (PublicShell) can pick this or DesktopShell without duplicating
// either JSX tree inline -- content, structure, and every class name here
// are byte-identical to what PublicShell itself used to render
// unconditionally.
function MobileShell({
  query,
  setQuery,
  discoverFilters,
}: Readonly<{
  query: string;
  setQuery: (query: string) => void;
  discoverFilters: ReactNode | null;
}>) {
  const location = useLocation();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Fixed header, top-0, unconditionally. Logo/search/account row
          and the Discover-only filter area (HeaderFilterArea) are flow
          siblings inside this one element: dragging the filter handle
          grows the header's own height, the search row never moves or
          resizes, and the filter content is revealed in the space that
          opens up beneath it, same panel, no seam. h-auto since the
          header's total height is not constant on Discover -- every
          other route never registers filter content, so
          HeaderFilterArea renders nothing and the header's height
          there is exactly the search row's own height. */}
      <header className="fixed inset-x-0 top-0 z-40 flex flex-col bg-background px-4">
        <div className="mx-auto flex h-14 w-full max-w-md shrink-0 items-center gap-2">
          {/* Logo: always visible top-left, beside search, on every tab
              including Profile (unlike the search bar itself, which is
              gated per SEARCH_VISIBLE_PATHS) -- this is shell chrome, not
              a search-adjacent control, per ux-ui-guidelines.md's Layout
              Shell Rules (persistent elements have fixed position on
              every page). Circle backdrop (bg-card + border-input) is
              the exact same two tokens the search Input itself uses
              (components/ui/input.tsx's own "border border-input
              bg-card"), so the logo's circle and the search bar read as
              one consistent surface color in the header, not a
              mismatched pairing, plus shadow-sm (the same token
              Input's own shadow-sm) so the circle lifts slightly off
              the header the same way the search bar already does.
              Image is scaled up past the circle's own bounds (h-12 w-12
              inside an h-9 w-9 parent) and the parent's overflow-hidden
              crops it back to a circle -- the source asset
              (lakbay-pasig-logo.svg) is a squircle clipped onto a
              512x512 canvas with visible corner padding baked into the
              image itself, so sizing the image to match the circle
              exactly left that padding visible as backdrop around a
              small mark; scaling past the frame and cropping is how
              "zoom in" on a pre-clipped source image works without a
              new, differently-cropped asset. Links home (/, the shell's
              own index route per App.tsx), matching bottom-nav.tsx's
              own Home tab destination -- same convention as any app's
              top-left logo-to-home pattern, per ux-ui-guidelines.md's
              Familiarity principle. shrink-0 keeps it a fixed size
              regardless of how wide the search bar grows next to it. */}
          <Link
            to="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-input bg-card shadow-sm"
            aria-label="Go to home"
          >
            <img
              src={logo}
              alt="Lakbay Pasig"
              className="h-11 w-11 max-w-none rounded-full object-cover"
            />
          </Link>
          {/* min-w-0 so the search bar (an absolutely-positioned-dropdown
              but a normal-flow Input) can actually shrink between the
              two fixed-size circles on either side, instead of forcing
              the row wider than the header at narrow viewports -- same
              flex-child overflow fix ux-ui-guidelines.md's Responsive
              Rules and this file's own existing name/text truncation
              guards elsewhere in the app already rely on. */}
          <div className="min-w-0 flex-1">
            {isSearchVisible(location.pathname) && (
              <GlobalSearchBar query={query} onQueryChange={setQuery} />
            )}
          </div>
          {/* Account menu: top-right, beside search, per direct
              instruction -- always visible (not gated on
              isSearchVisible), same "shell chrome, every page" reasoning
              as the logo on the left. */}
          <AccountMenu />
        </div>
        <HeaderFilterArea content={discoverFilters} />
      </header>
      {/* Fixed top-14, the header's own resting (closed) height. The
          map/list underneath never moves or resizes as the header's
          filter area opens -- the header simply grows over top of
          this fixed layer (z-40 vs. this element's own stacking
          context). */}
      <main className="fixed inset-x-0 top-14 bottom-16 overflow-y-auto">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

// Desktop shell: reuses the admin panel's own Sidebar/SidebarProvider/
// SidebarInset primitives (components/ui/sidebar.tsx) and PublicSidebar's
// admin-sidebar.tsx-styled nav, per direct instruction to reuse that same
// pattern rather than keep the mobile fixed-header/bottom-nav chrome at
// desktop widths. The collapse control is no longer SidebarTrigger in a
// bar here -- it now lives in PublicSidebar's own header row, Amkor-style
// (see public-sidebar.tsx's HeaderLogoRow), so SidebarInset renders no
// header of its own at all.
//
// Search/filters panel: per direct instruction, search never sits in a
// top bar on desktop -- it lives in the sidebar itself (PublicSidebar's
// new Search row) and clicking it expands a second panel between the nav
// rail and the main content, similar in spirit to Apple Maps' own
// Search-in-the-rail-opens-a-panel-beside-it pattern. This shell owns
// `searchPanelOpen` (passed down to PublicSidebar so its Search row's
// pressed/active state and this panel's visibility stay in sync from one
// piece of state, not two) and renders the panel as a `fixed` overlay,
// not a flex sibling of SidebarInset -- a flex sibling's own width change
// (open vs. closed) pushes every later sibling including SidebarInset,
// which resizes DiscoverMap's container and visibly breaks the map (see
// the panel's own comment below). A second Sidebar/Sheet instance was
// also ruled out: the existing Sidebar primitive only models one
// collapsible rail, not a nav-rail-plus-content-panel pair (confirmed by
// reading components/ui/sidebar.tsx before building this rather than
// fighting that primitive into a shape it doesn't support).
//
// Per ux-ui-guidelines.md's side-panel rule ("use a side panel only when
// the content needs comparison with the underlying page... user needs to
// keep context visible while interacting"): the panel always contains
// GlobalSearchBar (every tab has a legitimate reason to search), but
// discoverFilters (Discover's own useDiscoverFilters content) only
// renders when Discover has actually registered it -- every other tab's
// panel is search-only, not padded out with empty filter UI that would
// violate the guidelines' "more than 30% empty is too large" sizing rule.
function DesktopShell({
  query,
  setQuery,
  discoverFilters,
}: Readonly<{
  query: string;
  setQuery: (query: string) => void;
  discoverFilters: ReactNode | null;
}>) {
  const location = useLocation();
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const searchVisible = isSearchVisible(location.pathname);
  const panelOpen = searchVisible && searchPanelOpen;

  return (
    <SidebarProvider>
      <PublicSidebar
        searchOpen={searchPanelOpen}
        onToggleSearch={() => setSearchPanelOpen((open) => !open)}
      />
      {/* Bug fix: this panel previously sat in the same flex row as
          SidebarInset (a plain flow sibling that only rendered when open),
          so opening/closing it resized SidebarInset itself -- and with it
          DiscoverMap's container, which (discover-map.tsx's own comment,
          "No container-resize handling") never calls MapLibre's resize()
          and has no ResizeObserver, so the map visibly shifted/tore on
          every open/close. An earlier fix kept a flex-flow spacer here to
          "reserve" the panel's width, matching Sidebar's own two-piece
          pattern -- but that spacer is itself a flex sibling of
          SidebarInset, so its own width animation still pushed
          SidebarInset (and the map inside it) exactly the same way.
          Removed outright: this panel is purely a `fixed`, z-20 overlay
          that floats on top of the page and never occupies layout space
          at all, so SidebarInset's box is 100% constant regardless of
          open/closed state -- nothing beside the sidebar itself can ever
          resize the map again.
          Positioned flush against the sidebar's own right edge via the
          same peer-data-[state] selectors SidebarInset already keys off
          of (peer is set on Sidebar's own root, sidebar.tsx line ~159),
          so the panel tracks the rail's real width (13rem expanded, 3rem
          collapsed via --sidebar-width-icon) without re-measuring it in
          JS -- it just reads the same CSS custom properties/data-state
          the rail itself renders with. */}
      <div
        className={cn(
          "fixed inset-y-0 z-20 hidden h-svh flex-col gap-4 overflow-y-auto border-r border-border bg-card p-4 transition-[left,width] duration-200 ease-linear md:flex",
          "left-[--sidebar-width] peer-data-[state=collapsed]:left-[--sidebar-width-icon]",
          panelOpen ? "w-80" : "w-0 !border-r-0 !p-0 overflow-hidden",
        )}
      >
        <GlobalSearchBar query={query} onQueryChange={setQuery} />
        {discoverFilters}
      </div>
      <SidebarInset
        className={cn(
          // Bug fix (round 2): the previous fix still let SidebarInset's
          // own `left` track the sidebar's live width via peer-data-
          // [state=collapsed], so the box genuinely changed size every
          // time the rail expanded/collapsed -- same resize, just
          // smoothed out instead of removed, which is why the map still
          // visibly moved. "Copy the search panel logic" literally: the
          // search panel div above never changes SidebarInset at all,
          // expanded or collapsed, open or closed -- it's a `fixed`
          // overlay that floats on top of a completely static layout.
          // Applying that same idea here means SidebarInset's `left` must
          // stop reading peer-data-[state] entirely and instead stay
          // pinned to one constant value: --sidebar-width-icon, the
          // collapsed rail's own width, which is the one footprint that
          // exists in both sidebar states (a collapsed rail is exactly
          // that wide; an expanded rail still starts with that same
          // icon-width strip before its extra labels/text run out past
          // it). The sidebar's own rail div is already `fixed` (sidebar.
          // tsx) at z-10, one below the search panel's z-20, so an
          // expanded rail's extra width now simply overlaps this
          // permanently-static SidebarInset the exact same way the search
          // panel already overlaps it when opened -- nothing here ever
          // recomputes a box size again, on any sidebar or panel state.
          "fixed inset-y-0 right-0 z-0 flex h-svh min-h-0 w-auto flex-none flex-col overflow-hidden",
          "left-[--sidebar-width-icon]",
        )}
      >
        {/* Bug fix / direct instruction: the collapse control now lives in
            PublicSidebar's own header row (Amkor's pattern -- collapse
            button beside the logo when expanded, the logo itself becomes
            the expand control when collapsed), so this bar -- previously
            here solely to hold SidebarTrigger -- is removed outright.
            Main content starts flush at the top of SidebarInset; nothing
            else was rendered in this bar to preserve. */}
        <div className="h-full overflow-y-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function PublicShell() {
  const [query, setQuery] = useState("");
  const [discoverFilters, setDiscoverFilters] = useState<ReactNode | null>(
    null,
  );
  const contextValue = useMemo(() => ({ query, setQuery }), [query]);
  const isMobile = useIsMobile();

  // Live location: one watchPosition subscription for the whole shell's
  // lifetime, replacing discover.tsx's old one-shot getCurrentPosition.
  // See UserLocationContext's own comment above for why this lives here
  // and why watchPosition rather than a single read.
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        // Denied or unavailable: no-op, Pasig default stays in place,
        // same fallback posture the old one-shot read already used --
        // geolocation here is an enhancement, not a required permission,
        // so no error state blocks either surface.
      },
      // enableHighAccuracy: GPS chip over coarse network/cell-tower
      // positioning. A tourist following turn-by-turn-style directions on
      // foot needs the accuracy a live watch is actually for; the default
      // (low accuracy, allowed to answer from a cached/coarse fix) would
      // undercut the entire point of switching off a one-shot read.
      { enableHighAccuracy: true },
    );
    // ponytail: no debounce/throttle on how often watchPosition can fire.
    // The device's own location provider paces updates (typically ~1/sec
    // on GPS, coarser on network positioning), which already matches a
    // walking pace -- add throttling only if a real device shows updates
    // arriving faster than the map/panel can usefully redraw.
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  const userLocationValue = useMemo(
    () => ({ userLocation, setUserLocation }),
    [userLocation],
  );

  const directionsValue = useDirectionsState(userLocation);

  return (
    <GlobalSearchContext.Provider value={contextValue}>
      <UserLocationContext.Provider value={userLocationValue}>
        <DirectionsContext.Provider value={directionsValue}>
          <DiscoverFiltersContext.Provider value={setDiscoverFilters}>
            {isMobile ? (
              <MobileShell query={query} setQuery={setQuery} discoverFilters={discoverFilters} />
            ) : (
              <DesktopShell query={query} setQuery={setQuery} discoverFilters={discoverFilters} />
            )}
          </DiscoverFiltersContext.Provider>
        </DirectionsContext.Provider>
      </UserLocationContext.Provider>
    </GlobalSearchContext.Provider>
  );
}
