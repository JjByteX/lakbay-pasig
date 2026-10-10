import { House, MapTrifold, Compass, Bookmark, MagnifyingGlass, User as UserIcon, Gear as SettingsIcon, SignOut, ArrowsLeftRight, CaretUpDown, Question } from "@phosphor-icons/react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { useSettingsModal } from "@/lib/settings-modal";
import { cn } from "@/lib/utils";
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
import { SidebarLogoRow } from "@/components/sidebar-logo-row";

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
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/trails", label: "Trails", icon: MapTrifold, end: false },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
  { to: "/saved", label: "Saved", icon: Bookmark, end: false },
] as const;

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
  const { openSettings } = useSettingsModal();

  // Log-out confirmation: same SignOutDialog (owns the actual signOut()
  // call) public-shell.tsx's mobile AccountMenu and admin-sidebar.tsx's
  // footer already use, not a new confirmation flow for this third
  // location.
  const [signOutOpen, setSignOutOpen] = useState(false);

  const initial = profile?.display_name?.[0]?.toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Shared header row (sidebar-logo-row.tsx), same one the admin
            sidebar uses: logo + wordmark link Home and a collapse button
            when expanded; one logo button that turns into the expand
            icon on hover when collapsed. */}
        <SidebarLogoRow to="/" />
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
                  <MagnifyingGlass weight={searchOpen ? "fill" : "bold"} className="h-4 w-4 shrink-0" />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {NAV_ITEMS.map((item) => {
                const active = item.end
                  ? currentPath === item.to
                  : currentPath === item.to || currentPath.startsWith(`${item.to}/`);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <NavLink to={item.to} end={item.end}>
                        <item.icon weight={active ? "fill" : "bold"} className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {/* Guest (no session): Home Page above Sign in, same "hide what
            doesn't apply rather than show it disabled" rule public-shell.
            tsx's mobile AccountMenu already follows for its own guest
            branch. Home Page here is the same /welcome destination as the
            signed-in profile menu's own Home Page item below -- a guest
            landed inside the app (e.g. mid auth flow) gets the same way
            back to the landing page a signed-in resident already has,
            rather than only being able to open the sign-in popup. */}
        {!session ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => navigate("/welcome")} tooltip="Home Page">
                <House className="h-4 w-4 shrink-0" />
                <span>Home Page</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => navigate("/help")} tooltip="Help & FAQ">
                <Question className="h-4 w-4 shrink-0" />
                <span>Help & FAQ</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
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
                className="h-10 py-0 pl-0 pr-2 group-data-[collapsible=icon]:mb-1 group-data-[collapsible=icon]:!p-0"
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
                <CaretUpDown className="h-4 w-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
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
              <DropdownMenuItem onClick={() => openSettings()}>
                <SettingsIcon className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/help")}>
                <Question className="mr-2 h-4 w-4" />
                Help & FAQ
              </DropdownMenuItem>
              {/* View switcher, staff/admin accounts only: same session,
                  same account, just "/admin" instead of "/" -- not a role
                  change, staff_role/system_permission are untouched, only
                  the URL changes. Sits right after Settings/before Home
                  Page since it's the same "which app am I in" concept the
                  Home Page item below already is, just the other
                  direction. admin-sidebar.tsx's own footer menu sends
                  staff/admin back here the same way (Resident View).
                  Hidden entirely for a resident with no staff_role,
                  rather than shown disabled, matching this codebase's
                  existing "hide what doesn't apply" rule (e.g. bottom-nav.
                  tsx's own header comment). */}
              {profile?.staff_role && (
                <DropdownMenuItem onClick={() => navigate("/admin")}>
                  <ArrowsLeftRight className="mr-2 h-4 w-4" />
                  {profile.staff_role === "admin" ? "Admin" : "Staff"} View
                </DropdownMenuItem>
              )}
              {/* Home Page: same new item as public-shell.tsx's mobile
                  AccountMenu -- takes a signed-in user back to the landing
                  page (/welcome, landing.tsx), distinct from this sidebar's
                  own "Home" nav tab above (NAV_ITEMS' "/" feed). Reuses the
                  same Home icon already imported for that tab; the two
                  never render side by side so there's no visual ambiguity
                  between them. */}
              <DropdownMenuItem onClick={() => navigate("/welcome")}>
                <House className="mr-2 h-4 w-4" />
                Home Page
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSignOutOpen(true)}>
                <SignOut className="mr-2 h-4 w-4" />
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
