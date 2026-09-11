import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { cn } from "@/lib/utils";

// Exact-match list routes only — each one's own AdminDataTable measures
// this outlet region to auto-size its page (see admin-data-table.tsx's
// VIEWPORT FIT comment). Their /new and /:id children (detail pages,
// the trail builder) are deliberately excluded: those rely on normal
// page scroll, same as admin-dashboard.tsx, and have no table to fit.
const BOUNDED_LIST_ROUTES = new Set([
  "/admin/places",
  "/admin/businesses",
  "/admin/events",
  "/admin/trails",
  "/admin/staff",
]);

export default function AdminPage() {
  const { profile, loading } = useAuth();
  const { pathname } = useLocation();
  const isBoundedListRoute = BOUNDED_LIST_ROUTES.has(pathname);

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
      <AdminSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
        </header>
        <div
          className={cn(
            "flex-1 p-6",
            isBoundedListRoute ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto"
          )}
        >
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
