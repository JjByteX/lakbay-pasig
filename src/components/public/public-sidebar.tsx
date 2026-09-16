import { Home, Map, Compass, Bookmark, Search, User as UserIcon, Settings as SettingsIcon, LogOut, ChevronsUpDown, PanelLeftOpen } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { cn } from "@/lib/utils";
import logo from "@/assets/lakbay-pasig-logo.svg";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AVATAR_SIZE } from "@/lib/avatar-storage";
import { SignOutDialog } from "@/components/sign-out-dialog";

// Desktop-only counterpart to bottom-nav.tsx: same four destinations, same
// left-to-right/top-to-bottom order (Home, Trails, Discover, Saved), same
// "Profile lives in an account area, not a nav tab" rule -- reusing admin-
// sidebar.tsx's own Sidebar/SidebarProvider primitives (components/ui/
// sidebar.tsx) rather than inventing a second sidebar shape, per direct
// instruction to reuse the admin sidebar pattern. public-shell.tsx renders
// this in place of the fixed header + BottomNav on desktop viewports
// (useIsMobile), and keeps rendering the existing mobile chrome unchanged
// below the breakpoint -- this file has no effect on the mobile layout.
//
// Search item: toggles a second, expandable panel the shell renders next
// to this sidebar (public-shell.tsx's DesktopShell), similar in spirit to
// Apple Maps' own Search entry in its left rail opening a details panel
// beside it -- but kept as an ordinary row in this same nav list rather
// than a separate section above it, per direct correction. `searchOpen`/
// `onToggleSearch` are controlled by the shell (not local state here)
// since the shell also needs to know whether to render that panel.
const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/trails", label: "Trails", icon: Map, end: false },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
  { to: "/saved", label: "Saved", icon: Bookmark, end: false },
] as const;

// Amkor-style header row (Sidebar.jsx): the collapse control lives here,
// not in a separate top bar over the main content (public-shell.tsx's
// DesktopShell used to render one solely to hold SidebarTrigger -- removed
// entirely now that this row is the one place to expand/collapse).
//
// Expanded: logo + wordmark stay a Home link exactly as before, plus a
// dedicated collapse button on the right (PanelLeftOpen, mirrored via
// scaleX(-1) so it visually points "in" -- same icon/flip Amkor uses for
// its own collapse button, not a new glyph).
// Collapsed: one button fills the same slot the logo alone used to, and
// is now the expand control too, since there's no room for a second
// target on an icon-only rail -- hovering it swaps the brand mark for a
// plain PanelLeftOpen via Tailwind's group-hover: variant (bug fix: was
// a separate plain-CSS block keyed on hand-written class names, see this
// button's own comment below), no component state for the hover itself,
// only the click still calls toggleSidebar().
function HeaderLogoRow() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Expand sidebar"
        // Bug fix: hover-swap previously depended entirely on a separate
        // plain-CSS block (index.css's .sidebar-logo-toggle rules) toggling
        // display on two sibling spans by class name alone, with no
        // Tailwind group state class on this button to anchor to and no
        // explicit base `display` on .sidebar-logo-expand in the JSX
        // itself -- fragile by construction, and the symptom reported
        // (hovering the collapsed brand icon shows nothing) matches that:
        // any mismatch between this file's class names and index.css's
        // selectors, or between the two build pipelines, silently drops
        // the swap with no visible error. Rebuilt with Tailwind's own
        // `group`/`group-hover:` state variants instead -- the same
        // mechanism this codebase's own sidebar.tsx already relies on for
        // every other collapsed/expanded swap (group-data-[collapsible=
        // icon]:hidden, etc per constraints.md's Inventory Before
        // Suggesting rule) -- so the hover state lives in one place (this
        // button's own class list) with an explicit `flex`/`hidden` pair
        // on each span, not a class-name contract with a second file.
        className="group/logo-toggle flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center group-hover/logo-toggle:hidden">
          <img src={logo} alt="Lakbay Pasig" className="h-6 w-6 shrink-0" />
        </span>
        <span className="hidden h-8 w-8 items-center justify-center group-hover/logo-toggle:flex">
          <PanelLeftOpen className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return (
    <div className="flex w-full items-center gap-2">
      <NavLink to="/" className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1">
        <img src={logo} alt="Lakbay Pasig" className="h-6 w-6 shrink-0" />
        <span className="truncate text-base font-semibold text-foreground">
          Lakbay Pasig
        </span>
      </NavLink>
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Collapse sidebar"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <PanelLeftOpen className="h-5 w-5 -scale-x-100" />
      </button>
    </div>
  );
}

export function PublicSidebar({
  searchOpen,
  onToggleSearch,
}: Readonly<{
  searchOpen: boolean;
  onToggleSearch: () => void;
}>) {
  const { session, profile } = useAuth();
  const { openAuth } = useAuthModal();
  const { pathname: currentPath } = useLocation();
  const navigate = useNavigate();

  // Log-out confirmation: same SignOutDialog (owns the actual signOut()
  // call) public-shell.tsx's mobile AccountMenu and admin-sidebar.tsx's
  // footer already use, not a new confirmation flow for this third
  // location.
  const [signOutOpen, setSignOutOpen] = useState(false);

  const initial = profile?.display_name?.[0]?.toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Amkor-style header: expanded shows the logo (still a Home link,
            unchanged from before) plus a dedicated collapse button on the
            right; collapsed shows a single button that is both the brand
            mark and the expand control, matching Amkor's own Sidebar.jsx
            header exactly (PanelLeftOpen, mirrored via scaleX(-1) when
            expanded, plain when collapsed) rather than reusing this
            project's generic SidebarTrigger, which the shell previously
            placed in a separate top bar in SidebarInset (public-shell.tsx)
            -- that whole bar is now gone; this row is the only collapse
            control on desktop.
            Collapsed hover swap (logo -> expand icon in the same slot) is
            Tailwind's own group-hover: variant (bug fix: see HeaderLogoRow's
            own button for why this replaced a separate plain-CSS block),
            not reimplemented with component state, since it's a decoration
            on a single already-interactive button, not new application
            state. */}
        <HeaderLogoRow />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Search: same list, same row styling as Home/Trails/Discover/
                  Saved below -- not a separate group above the nav (per
                  direct correction: keep it inline in the sidebar, not
                  pulled out on its own). Toggles the shell's expandable
                  search/filters panel (public-shell.tsx's DesktopShell)
                  rather than navigating; isActive reflects the panel's own
                  open state instead of a route match, same isActive prop
                  every other row already uses just driven by different
                  state. */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={searchOpen}
                  tooltip="Search"
                  onClick={onToggleSearch}
                  aria-expanded={searchOpen}
                >
                  <Search className="h-4 w-4 shrink-0" />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.end ? currentPath === item.to : currentPath === item.to || currentPath.startsWith(`${item.to}/`)
                    }
                    tooltip={item.label}
                  >
                    <NavLink to={item.to} end={item.end}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {/* Guest (no session): a single Sign in row, same "hide what
            doesn't apply rather than show it disabled" rule public-shell.
            tsx's mobile AccountMenu already follows for its own guest
            branch. */}
        {!session ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => openAuth("login")} tooltip="Sign in">
                <UserIcon className="h-4 w-4 shrink-0" />
                <span>Sign in</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          // Amkor-style profile menu: the account row itself is the
          // trigger (not three permanently-stacked rows below it) --
          // clicking it opens a floating menu with Profile/Settings/Sign
          // out, same three destinations Amkor's own ProfileMenu popup
          // lists (Sidebar.jsx), just without Amkor's dark-mode toggle
          // row and branch switcher, which don't apply here. Radix's
          // DropdownMenu is this project's own existing equivalent of
          // Amkor's hand-rolled createPortal popup -- both render outside
          // the sidebar's clipped scroll container so the menu is never
          // cut off, and public-shell.tsx's mobile AccountMenu already
          // uses this exact primitive for this exact Profile/Settings/
          // Sign out trio, reused here rather than re-implementing
          // Amkor's own portal/positioning plumbing (usePortalPosition,
          // createPortal) a second time in a codebase that already has a
          // menu primitive that does the same job.
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                tooltip={profile?.display_name ?? "Account"}
                className="h-auto py-1"
                aria-label="Account menu"
              >
                <Avatar className={cn(AVATAR_SIZE.sm, "shrink-0")}>
                  {profile?.profile_picture && <AvatarImage src={profile.profile_picture} alt="" />}
                  <AvatarFallback className="leading-none">
                    {initial ?? <UserIcon className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {profile?.display_name ?? "Account"}
                  </span>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            {/* Bug fix: side="right" opened this menu out past the rail's
                own right edge, floating away from the trigger toward the
                middle of the page (especially noticeable collapsed, where
                the rail is only --sidebar-width-icon wide) instead of
                hugging the account icon it belongs to. This is the
                sidebar's footer row, not a mid-page trigger with room to
                spare on its right -- side="top" anchors the menu directly
                above the trigger instead, the natural direction for a
                bottom-of-rail control, matching Amkor's own bottom-left
                profile menu placement this row was modeled on in the
                first place. align="start" (not "end"): with side="top" the
                align axis is horizontal, and "start" keeps the menu's own
                left edge flush with the trigger's left edge (both expanded
                and collapsed widths), rather than "end" pulling it flush
                to the trigger's right edge, which would overhang further
                past the rail on the narrow collapsed width. */}
            <DropdownMenuContent side="top" align="start" sideOffset={8}>
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
        )}
      </SidebarFooter>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </Sidebar>
  );
}
