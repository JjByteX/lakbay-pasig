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
} from "lucide-react";
import { BottomNav } from "./bottom-nav";
import { PublicSidebar } from "./public-sidebar";
import { GlobalSearchBar } from "./global-search-bar";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
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
// exactly, no synonym introduced for either concept.
function AccountMenu() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
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
          <DropdownMenuItem onClick={() => navigate("/login")}>
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
// SidebarInset/SidebarTrigger primitives (components/ui/sidebar.tsx) and
// PublicSidebar's admin-sidebar.tsx-styled nav, per direct instruction to
// reuse that same pattern rather than keep the mobile fixed-header/
// bottom-nav chrome at desktop widths.
//
// Search/filters panel: per direct instruction, search never sits in a
// top bar on desktop -- it lives in the sidebar itself (PublicSidebar's
// new Search row) and clicking it expands a second panel between the nav
// rail and the main content, similar in spirit to Apple Maps' own
// Search-in-the-rail-opens-a-panel-beside-it pattern. This shell owns
// `searchPanelOpen` (passed down to PublicSidebar so its Search row's
// pressed/active state and this panel's visibility stay in sync from one
// piece of state, not two) and renders the panel as a plain flex sibling
// of SidebarInset -- not a second Sidebar/Sheet instance, since the
// existing Sidebar primitive only models one collapsible rail, not a
// nav-rail-plus-content-panel pair (confirmed by reading components/ui/
// sidebar.tsx before building this rather than fighting that primitive
// into a shape it doesn't support).
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

  return (
    <SidebarProvider>
      <PublicSidebar
        searchOpen={searchPanelOpen}
        onToggleSearch={() => setSearchPanelOpen((open) => !open)}
      />
      {/* Same bg-card + border-border surface admin-sidebar.tsx's own
          Sidebar already renders with, so this panel reads as one
          continuous nav-adjacent surface with the rail beside it, not a
          mismatched third color. w-80 is a fixed panel width (unlike the
          collapsible nav rail) -- Apple Maps' own reference panel is a
          similar fixed width, not something that shrinks/grows with
          window size. */}
      {searchVisible && searchPanelOpen && (
        <div className="flex h-svh w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card p-4">
          <GlobalSearchBar query={query} onQueryChange={setQuery} />
          {discoverFilters}
        </div>
      )}
      <SidebarInset className="h-svh overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <SidebarTrigger />
        </header>
        <div className="flex-1 overflow-y-auto">
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

  return (
    <GlobalSearchContext.Provider value={contextValue}>
      <DiscoverFiltersContext.Provider value={setDiscoverFilters}>
        {isMobile ? (
          <MobileShell query={query} setQuery={setQuery} discoverFilters={discoverFilters} />
        ) : (
          <DesktopShell query={query} setQuery={setQuery} discoverFilters={discoverFilters} />
        )}
      </DiscoverFiltersContext.Provider>
    </GlobalSearchContext.Provider>
  );
}
