import { LayoutDashboard, Landmark, Store, CalendarDays, Map, Tags, Image, Users, Settings as SettingsIcon, LogOut, Home, ArrowLeftRight, ChevronsUpDown } from "lucide-react";
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

// Sidebar Sections per admin-panel-spec.md. Dashboard always visible.
// Places needs manage_places or admin, Businesses needs review_businesses or
// admin, Events needs publish_events or admin, Trails needs build_trails or
// admin. Staff is adminOnly: true, admin role only per admin-panel-spec.md's
// Staff Roles section, no system_permission string grants it, unlike the
// other sections.
//
// Categories (category-directory-phases.md Phase 2.1): one entry, not one
// per content type — the destination page is a single tabbed screen
// (Places / Trails / Announcements tabs), matching the plan doc's "one
// Categories sidebar section, not three" call. This entry uses
// `permissions` (plural, any-of) instead of the single `permission` field
// the other content-type items use: a staff member needs at least one of
// manage_places, build_trails, publish_events, or review_businesses to see
// it at all, per admin-panel-spec.md's Access Rule ("unauthorized areas do
// not appear at all"), same reasoning the route guard below applies
// (Phase 2.2). Which of the now-five tabs a staff member can actually use
// once inside is decided per tab (Phase 2.4); this item only decides
// whether the page shows up in the sidebar at all.
//
// Category Directory Expansion, Phase 2.1: review_businesses added to the
// array, since the page's new Business Category tab (Phase 2.3) gives a
// staff member with only that permission a real tab to use here for the
// first time — the prior comment's "someone with only review_businesses
// has no tab to use on this page" no longer holds once this phase ships.
// Facilities needs no array change: manage_places already covers it, same
// permission Places itself already uses.
const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: null, permissions: null, adminOnly: false },
  { to: "/admin/places", label: "Places", icon: Landmark, permission: "manage_places" as const, permissions: null, adminOnly: false },
  { to: "/admin/businesses", label: "Businesses", icon: Store, permission: "review_businesses" as const, permissions: null, adminOnly: false },
  { to: "/admin/events", label: "Announcements", icon: CalendarDays, permission: "publish_events" as const, permissions: null, adminOnly: false },
  { to: "/admin/trails", label: "Trails", icon: Map, permission: "build_trails" as const, permissions: null, adminOnly: false },
  {
    to: "/admin/categories",
    label: "Categories",
    icon: Tags,
    permission: null,
    permissions: ["manage_places", "build_trails", "publish_events", "review_businesses"] as const,
    adminOnly: false,
  },
  // Landing Page (landing-hero-phases.md Phase 3.1): the hero carousel
  // shown to a signed-out visitor on /welcome, /login, and /signup. Own
  // permission (manage_landing, migration 0033), not folded into
  // manage_places or any existing value -- none of the four cover
  // landing content, and reusing manage_places would hand every place
  // editor control over the first screen a new visitor sees.
  { to: "/admin/landing", label: "Landing Page", icon: Image, permission: "manage_landing" as const, permissions: null, adminOnly: false },
  { to: "/admin/staff", label: "Staff", icon: Users, permission: null, permissions: null, adminOnly: true },
  // Personal display preference, not a content section -- visible to
  // every staff member the same way Dashboard is (permission: null,
  // adminOnly: false), not gated behind any system_permission or the
  // Staff section's admin-only rule. See admin-settings.tsx's own header
  // comment for the full reasoning.
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon, permission: null, permissions: null, adminOnly: false },
];

export function AdminSidebar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { pathname: currentPath } = useLocation();
  const isAdmin = profile?.staff_role === "admin";

  // Log-out confirmation: the footer's Sign out menu item doesn't call
  // signOut directly, it opens SignOutDialog (owns the actual signOut()
  // call), same shared component and pattern public-shell.tsx's
  // AccountMenu and profile.tsx's Sign out button use. See
  // sign-out-dialog.tsx.
  const [signOutOpen, setSignOutOpen] = useState(false);

  // Filtered items do not render at all, no greyed out state, per
  // admin-panel-spec.md Access Rule and 3.2. adminOnly items need staff_role
  // === admin specifically, isAdmin alone already captures that, a
  // permission string is never enough on its own for those items.
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.permissions) {
      return isAdmin || item.permissions.some((p) => profile?.system_permission?.includes(p));
    }
    return item.permission === null || isAdmin || profile?.system_permission?.includes(item.permission);
  });

  const initial = profile?.display_name?.[0]?.toUpperCase() ?? "?";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Logo: always visible, collapsed or expanded, same persistence
            pattern the footer's Avatar already establishes below (no
            group-data-[collapsible=icon]:hidden on the icon itself, only
            the text beside it hides). The logo asset (lakbay-pasig-
            logo.svg, already used by auth-layout.tsx) is a square
            512x512 squircle mark, so it survives the collapsed rail
            without cropping in principle -- the earlier version still
            clipped in practice because this row's own px-2 py-1 stacked
            on top of SidebarHeader's own p-2, leaving only 16px of the
            collapsed 3rem rail for a 32px (h-8 w-8) image, and neither
            padding value changed between expanded/collapsed states, so
            the image visibly fought the shrinking container during the
            200ms width transition (sidebar.tsx) instead of settling
            into it. Fixed by following the same collapse-state-aware
            sizing sidebarMenuButtonVariants already uses for nav buttons
            (group-data-[collapsible=icon]:!size-8 group-data-
            [collapsible=icon]:!p-2 there): the row itself drops to !p-0
            when collapsed so SidebarHeader's own p-2 is the only inset
            left (matching the nav buttons' own collapsed math, size-8
            inside p-2 of a 48px rail), and the image is sized smaller
            (h-6 w-6, 24px) so it fits that collapsed space with room to
            spare rather than exactly filling it. justify-center
            re-centers the row once the label hides, matching the
            footer's own group-data-[collapsible=icon]:justify-center.
            Bumped "CATO Admin" from text-sm to text-base, one step up
            the existing type scale (text-base is already an established
            token across the public surface, just newly reused here in
            admin) rather than a new arbitrary size, per ux-ui-
            guidelines.md's Consistency Rules ("if a value is used once,
            it must be reused everywhere that context applies. Never
            invent a new value for the same purpose."). */}
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!p-0">
          <img src={logo} alt="Lakbay Pasig" className="h-6 w-6 shrink-0" />
          <span className="text-base font-semibold text-foreground group-data-[collapsible=icon]:hidden">
            CATO Admin
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.to === "/admin"
                        ? currentPath === item.to
                        : currentPath === item.to || currentPath.startsWith(`${item.to}/`)
                    }
                    tooltip={item.label}
                  >
                    <NavLink to={item.to} end={item.to === "/admin"}>
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
        {/* Profile menu: same Amkor-style pattern as public-sidebar.tsx's
            own footer -- the account row itself is the trigger (avatar +
            name/position, same content this row always showed), and
            clicking it opens a floating menu instead of the row carrying
            a separate always-visible log-out icon button beside it. Radix's
            DropdownMenu, same primitive public-sidebar.tsx and public-
            shell.tsx's mobile AccountMenu already use for this exact job,
            reused here rather than a third bespoke popup.
            Menu items: Resident View (this same signed-in
            account, browsing "/" as a resident would -- distinct from Home
            Page below, which is the signed-out-style landing page, not the
            app itself), then Home Page, then Sign out. No Profile/Settings
            items here unlike public-sidebar.tsx's version -- admin has no
            separate account page, and Settings already has its own
            top-level nav entry above (NAV_ITEMS' "/admin/settings" row),
            so repeating it in this menu would be the same destination
            reachable two ways for no reason. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={profile?.display_name ?? "Account"}
              className="h-auto py-1"
              aria-label="Account menu"
            >
              {/* Phase 6.5/6.6/6.8: AvatarImage renders profile.profile_picture
                  when set, same AvatarFallback initial as before when it's
                  null (a signed-in staff member with no uploaded picture) --
                  Radix's Avatar already falls back automatically on a missing/
                  broken src, no extra loading branch needed here. Size reads
                  from avatar-storage.ts's shared AVATAR_SIZE.sm, per 6.8's
                  one-shared-scale requirement. */}
              <Avatar className={cn(AVATAR_SIZE.sm, "shrink-0")}>
                {profile?.profile_picture && <AvatarImage src={profile.profile_picture} alt="" />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                {/* Bumped one step up the type scale, matching the header's
                    CATO Admin label above (text-sm -> text-base, text-xs ->
                    text-sm), keeping the same relative primary/secondary
                    two-size relationship this block already had, just
                    shifted up one rung, per the same Consistency Rules
                    reasoning as the header. */}
                <span className="truncate text-base font-semibold text-foreground">
                  {profile?.display_name ?? "Staff"}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {profile?.position ?? (isAdmin ? "Admin" : "Staff")}
                </span>
              </div>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          {/* side="top"/align="start": same bug-fix reasoning as public-
              sidebar.tsx's own footer menu -- this is the bottom-of-rail
              row, so the menu opens upward, hugging the trigger's left
              edge, rather than side="right" floating away from a narrow
              collapsed rail. */}
          <DropdownMenuContent side="top" align="start" sideOffset={8}>
            {/* View switcher: same session, same account, just the "/"
                resident app instead of "/admin" -- not a role change and
                not a second sign-in, staff_role/system_permission are
                untouched by this, only the URL you're looking at changes.
                A resident's own counterpart to this item (public-sidebar.
                tsx, public-shell.tsx's AccountMenu) sends staff/admin back
                here the same way. */}
            <DropdownMenuItem onClick={() => navigate("/")}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Resident View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/welcome")}>
              <Home className="mr-2 h-4 w-4" />
              Home Page
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSignOutOpen(true)}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </Sidebar>
  );
}
