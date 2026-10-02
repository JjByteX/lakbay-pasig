import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminSearchBar } from "@/components/admin/admin-search-bar";
import { useAdminNotificationQueues } from "@/hooks/use-admin-notification-queues";
import { totalPending } from "@/lib/admin-notifications";
import { cn } from "@/lib/utils";

// Exact-match list routes — each one's own AdminDataTable measures this
// outlet region to auto-size its page (see admin-data-table.tsx's
// VIEWPORT FIT comment).
const BOUNDED_LIST_ROUTES = new Set([
  "/admin/places",
  "/admin/businesses",
  "/admin/events",
  "/admin/trails",
  "/admin/categories",
  "/admin/staff",
  "/admin/activity",
]);

// Sub pages (place new/edit, discovery review, business detail, trail
// builder) are bounded too, like amkor's forms: the page fits the viewport
// and the card inside it scrolls when its content is taller (see
// admin-form-card.tsx). Only admin-dashboard.tsx keeps a scrolling page.
const BOUNDED_SUB_PAGE = /^\/admin\/(places|businesses|trails)\/[^/]+(\/[^/]+)?$/;

export default function AdminPage() {
  const { profile, loading } = useAuth();
  const { pathname } = useLocation();
  const isBoundedRoute = BOUNDED_LIST_ROUTES.has(pathname) || BOUNDED_SUB_PAGE.test(pathname);
  // Spotlight search: opened by the sidebar's Search row or Ctrl/Cmd+K. State
  // lives here, not in the sidebar, since the mobile sidebar sheet unmounts
  // its contents when closed.
  const [searchOpen, setSearchOpen] = useState(false);
  // Pending-review counts for the sidebar rows and the phone menu button.
  const queues = useAdminNotificationQueues();
  const pendingTotal = queues ? totalPending(queues) : 0;

  // Session loading state, distinct from the happy path per plan 3.4.
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading admin panel…</p>
      </div>
    );
  }

  const isAdmin = profile?.staff_role === "admin";
  const hasAnyPermission = isAdmin || (profile?.system_permission?.length ?? 0) > 0;

  // No permissions at all state: staff_role is set (route guard already
  // confirmed this) but system_permission is empty and they're not admin.
  // Dashboard is still their landing page, it just has nothing to show yet.
  if (!hasAnyPermission) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-6">
        <p className="text-center text-sm text-muted-foreground">
          No sections assigned yet. Contact an Admin to get access.
        </p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AdminSidebar searchOpen={searchOpen} onSearch={() => setSearchOpen(true)} queues={queues} />
      <AdminSearchBar open={searchOpen} onOpenChange={setSearchOpen} />
      <SidebarInset className="h-svh overflow-hidden">
        {/* Phone-only top bar. Search moved into the sidebar (the Search
            row) and the notification bell was replaced by pending counts
            on the sidebar's Places and Businesses rows, so on desktop this
            bar would hold nothing and is not rendered, which gives its
            56px back to the page. Below md the sidebar is an offcanvas
            sheet, so the trigger here is the only way to open it; it
            carries a dot when anything is pending, because the counts
            themselves are inside the closed sheet. */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-6 md:hidden">
          <div className="relative">
            <SidebarTrigger />
            {pendingTotal > 0 && (
              <span
                role="status"
                aria-label={`${pendingTotal} pending`}
                className="pointer-events-none absolute right-0 top-0 h-2 w-2 rounded-full bg-primary"
              />
            )}
          </div>
        </header>
        <div
          className={cn(
            "flex-1 p-6",
            isBoundedRoute ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto"
          )}
        >
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
