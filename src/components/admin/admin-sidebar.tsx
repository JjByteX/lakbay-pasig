import { LayoutDashboard, Landmark, Store, CalendarDays, Map, Users, LogOut } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

// Sidebar Sections per admin-panel-spec.md. Dashboard always visible.
// Places needs manage_places or admin, Businesses needs review_businesses or
// admin, Events needs publish_events or admin, Trails needs build_trails or
// admin. Staff is adminOnly: true, admin role only per admin-panel-spec.md's
// Staff Roles section, no system_permission string grants it, unlike the
// other sections.
const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: null, adminOnly: false },
  { to: "/admin/places", label: "Places", icon: Landmark, permission: "manage_places" as const, adminOnly: false },
  { to: "/admin/businesses", label: "Businesses", icon: Store, permission: "review_businesses" as const, adminOnly: false },
  { to: "/admin/events", label: "Events & Announcements", icon: CalendarDays, permission: "publish_events" as const, adminOnly: false },
  { to: "/admin/trails", label: "Trails", icon: Map, permission: "build_trails" as const, adminOnly: false },
  { to: "/admin/staff", label: "Staff", icon: Users, permission: null, adminOnly: true },
];

export function AdminSidebar() {
  const { profile, signOut } = useAuth();
  const { pathname: currentPath } = useLocation();
  const isAdmin = profile?.staff_role === "admin";

  // Filtered items do not render at all, no greyed out state, per
  // admin-panel-spec.md Access Rule and 3.2. adminOnly items need staff_role
  // === admin specifically, isAdmin alone already captures that, a
  // permission string is never enough on its own for those items.
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return isAdmin;
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
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
          <Avatar className="h-8 w-8 shrink-0">
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 group-data-[collapsible=icon]:hidden"
            onClick={signOut}
          >
            <LogOut />
            <span className="sr-only">Log out</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
