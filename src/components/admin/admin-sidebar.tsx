import { SquaresFour, ChartBar, Bank, Storefront, CalendarDots, MapTrifold, Tag, Image, Users, Pulse, Gear as SettingsIcon, SignOut, House, ArrowsLeftRight, CaretUpDown } from "@phosphor-icons/react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
//
// Two groups, in this order: Main (no label, same spot the single group
// always had, so nothing above or beside it moves) and Tools (labeled).
// `group` only picks the block an item renders in; who sees it is still
// decided by permission, permissions and adminOnly. Reports is not in this
// list yet, see the placeholder row in the Tools group below.
const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: SquaresFour, permission: null, permissions: null, adminOnly: false, group: "main" },
  { to: "/admin/events", label: "Announcements", icon: CalendarDots, permission: "publish_events" as const, permissions: null, adminOnly: false, group: "main" },
  { to: "/admin/places", label: "Places", icon: Bank, permission: "manage_places" as const, permissions: null, adminOnly: false, group: "main" },
  { to: "/admin/businesses", label: "Businesses", icon: Storefront, permission: "review_businesses" as const, permissions: null, adminOnly: false, group: "main" },
  { to: "/admin/trails", label: "Trails", icon: MapTrifold, permission: "build_trails" as const, permissions: null, adminOnly: false, group: "main" },
  // Landing Page (landing-hero-phases.md Phase 3.1): the hero carousel
  // shown to a signed-out visitor on /welcome, /login, and /signup. Own
  // permission (manage_landing, migration 0033), not folded into
  // manage_places or any existing value -- none of the four cover
  // landing content, and reusing manage_places would hand every place
  // editor control over the first screen a new visitor sees.
  { to: "/admin/landing", label: "Landing Page", icon: Image, permission: "manage_landing" as const, permissions: null, adminOnly: false, group: "tools" },
  {
    to: "/admin/categories",
    label: "Categories",
    icon: Tag,
    permission: null,
    permissions: ["manage_places", "build_trails", "publish_events", "review_businesses"] as const,
    adminOnly: false,
    group: "tools",
  },
  { to: "/admin/staff", label: "Staff", icon: Users, permission: null, permissions: null, adminOnly: true, group: "tools" },
  // Activity (activity-log-phases.md Phase 4.1): read only table of staff and
  // admin actions (activity_log, migration 0037). adminOnly: true, same as
  // Staff above, RLS already returns zero rows to a non admin, so hiding
  // the item is the second layer, not the only one.
  { to: "/admin/activity", label: "Activity", icon: Pulse, permission: null, permissions: null, adminOnly: true, group: "tools" },
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

  const mainItems = visibleItems.filter((item) => item.group === "main");
  const toolItems = visibleItems.filter((item) => item.group === "tools");

  function renderItem(item: (typeof NAV_ITEMS)[number]) {
    const active =
      item.to === "/admin"
        ? currentPath === item.to
        : currentPath === item.to || currentPath.startsWith(`${item.to}/`);
    return (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
          <NavLink to={item.to} end={item.to === "/admin"}>
            <item.icon weight={active ? "fill" : "bold"} className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const initial = profile?.display_name?.[0]?.toUpperCase() ?? "?";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Same shared header row as the resident sidebar
            (sidebar-logo-row.tsx): logo + "Lakbay Pasig" linking to the
            admin dashboard, collapse button when expanded, logo that
            becomes the expand icon on hover when collapsed. */}
        <SidebarLogoRow to="/admin" />
      </SidebarHeader>
      {/* gap-0: SidebarContent's default gap-2 sat on top of each group's own
          p-2, so the Tools label was about 34px under Announcements-and-friends
          against 16px from the header to Dashboard. With no gap and no top
          padding on the Tools group, the label sits 16px under the last Main
          item, the same distance Dashboard sits under the header. */}
      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{mainItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Tools: the only labeled group. Sentence case, no uppercase (the
            label's own style has none). pointer-events-none because when the
            rail collapses the label fades out but keeps its box, which is
            pulled up over the bottom edge of the last Main item and would
            otherwise swallow clicks there. */}
        <SidebarGroup className="pt-0">
          <SidebarGroupLabel className="pointer-events-none">Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Reports: coming soon placeholder. Not a link and not in
                  NAV_ITEMS, since there is no route or permission yet (no
                  spec covers it). Admin only for now, so staff never see a
                  greyed out section, per admin-panel-spec.md's Access Rule.
                  When the page exists, move this into NAV_ITEMS as the
                  first group: "tools" entry and delete this row. */}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <ChartBar weight="bold" className="h-4 w-4 shrink-0" />
                    <span>Reports</span>
                    <span className="ml-auto text-xs group-data-[collapsible=icon]:hidden">
                      Coming soon
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {toolItems.map(renderItem)}
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
            Menu items: Settings (personal display preference, visible to
            every staff member, same as public-sidebar.tsx's own Settings
            item, which is also only in the menu and not a nav tab), then
            Resident View (this same signed-in account, browsing "/" as a
            resident would -- distinct from Home Page below, which is the
            signed-out-style landing page, not the app itself), then Home
            Page, then Sign out. No Profile item unlike public-sidebar.tsx's
            version -- admin has no separate account page. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={profile?.display_name ?? "Account"}
              className="h-10 py-0 pl-0 pr-2 group-data-[collapsible=icon]:mb-1 group-data-[collapsible=icon]:!p-0"
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
                <AvatarFallback className="leading-none">{initial}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-semibold text-foreground">
                  {profile?.display_name ?? "Staff"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {profile?.position ?? (isAdmin ? "Admin" : "Staff")}
                </span>
              </div>
              <CaretUpDown className="h-4 w-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
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
            <DropdownMenuItem onClick={() => navigate("/admin/settings")}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/")}>
              <ArrowsLeftRight className="mr-2 h-4 w-4" />
              Resident View
            </DropdownMenuItem>
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
      </SidebarFooter>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </Sidebar>
  );
}
