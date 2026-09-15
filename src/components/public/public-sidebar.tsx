import { Home, Map, Compass, Bookmark, Search, User as UserIcon, Settings as SettingsIcon, LogOut } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
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
} from "@/components/ui/sidebar";
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

export function PublicSidebar({
  searchOpen,
  onToggleSearch,
}: Readonly<{
  searchOpen: boolean;
  onToggleSearch: () => void;
}>) {
  const { session, profile } = useAuth();
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
        {/* Logo, same collapse-aware sizing/padding admin-sidebar.tsx's own
            header already establishes (see that file's header comment for
            the full reasoning) -- reused verbatim rather than re-deriving
            it, since it's the identical logo asset and the identical
            collapsed-rail constraint. Links home, matching the mobile
            header's own logo-to-home behavior (public-shell.tsx). */}
        <NavLink
          to="/"
          className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!p-0"
        >
          <img src={logo} alt="Lakbay Pasig" className="h-6 w-6 shrink-0" />
          <span className="text-base font-semibold text-foreground group-data-[collapsible=icon]:hidden">
            Lakbay Pasig
          </span>
        </NavLink>
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
              <SidebarMenuButton onClick={() => navigate("/login")} tooltip="Sign in">
                <UserIcon className="h-4 w-4 shrink-0" />
                <span>Sign in</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          <>
            <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
              {/* Same AVATAR_SIZE.sm + AvatarImage/AvatarFallback pattern
                  admin-sidebar.tsx's own footer uses, reused rather than a
                  new size or fallback rule for this third avatar spot. */}
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
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath === "/profile"}
                  tooltip="Profile"
                >
                  <NavLink to="/profile">
                    <UserIcon className="h-4 w-4 shrink-0" />
                    <span>Profile</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={currentPath === "/profile/settings"}
                  tooltip="Settings"
                >
                  <NavLink to="/profile/settings">
                    <SettingsIcon className="h-4 w-4 shrink-0" />
                    <span>Settings</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setSignOutOpen(true)} tooltip="Sign out">
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
      </SidebarFooter>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </Sidebar>
  );
}
