import { LayoutDashboard, Landmark, Store, CalendarDays, Map, Users, LogOut } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
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
        <span className="px-2 py-1 text-sm font-semibold text-foreground group-data-[collapsible=icon]:hidden">
          CATO Admin
        </span>
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
            <span className="truncate text-sm font-semibold text-foreground">
              {profile?.display_name ?? "Staff"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
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
