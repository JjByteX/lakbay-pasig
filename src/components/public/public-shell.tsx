import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { createContext, useContext, useMemo, useState } from "react";
import { User as UserIcon, Settings as SettingsIcon, LogOut } from "lucide-react";
import { BottomNav } from "./bottom-nav";
import { GlobalSearchBar } from "./global-search-bar";
import { useAuth } from "@/lib/auth-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const GlobalSearchContext = createContext<GlobalSearchContextValue | undefined>(undefined);

/** Lets a page (Discover) read/clear the shell's shared search query. */
export function useGlobalSearchQuery() {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) throw new Error("useGlobalSearchQuery must be used within PublicShell");
  return ctx;
}

// Tabs the search bar appears on, per the resolved spec. Profile is a full
// account-settings page the person scrolls through, not a lookup surface,
// same reasoning navigation-and-access-control.md already gives Home for
// staying passive -- explicitly excluded rather than defaulting it in.
// "/events" is included even though it isn't one of the bottom-nav tabs:
// App.tsx nests events/:id directly under the shell at the top
// level (not under any tab's own path prefix), reached from Home's
// AnnouncementCard row tap, so it's still part of the Home surface the
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
    (path) => pathname === path || pathname.startsWith(`${path}/`)
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
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const initial = profile?.display_name?.[0]?.toUpperCase();

  if (!session) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0 leading-none shadow-sm"
          aria-label="Account menu"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback className="leading-none">
              <UserIcon className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate("/login")}>Sign in</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0 leading-none shadow-sm"
        aria-label="Account menu"
      >
        <Avatar className="h-9 w-9">
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
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PublicShell() {
  const [query, setQuery] = useState("");
  const location = useLocation();
  const contextValue = useMemo(() => ({ query, setQuery }), [query]);

  return (
    <GlobalSearchContext.Provider value={contextValue}>
      <div className="flex min-h-svh flex-col bg-background">
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center px-4">
          <div className="mx-auto flex w-full max-w-md items-center gap-2">
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
        </header>
        <main className="fixed inset-x-0 bottom-16 top-14 overflow-y-auto">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </GlobalSearchContext.Provider>
  );
}
