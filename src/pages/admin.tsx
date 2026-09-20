import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminSearchBar } from "@/components/admin/admin-search-bar";
import { AdminNotificationBell } from "@/components/admin/admin-notification-bell";
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
  "/admin/categories",
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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-6">
          <SidebarTrigger />
          {/* Phase 3.4/4.3: search and notifications land here together,
              both new to this header, which previously held only the
              trigger (confirmed directly before adding anything, per
              constraints.md's File Traversal rule). Search sits top
              right at a bounded width (its own max-w-xs) rather than
              stretching the full remaining row, per ux-ui-guidelines.md's
              Component Sizing Rules ("size components proportionally to
              the amount of content they hold") -- a full-width bar here
              would be oversized against a single-line input, the same
              reasoning that rule already applies elsewhere in this
              codebase. ml-auto pushes the bell+search group to the right
              edge as one unit. No profile icon exists in this header to
              sit left of (admin-sidebar.tsx's footer already owns
              account/sign-out, see admin-notification-bell.tsx's own
              header comment) -- not added here, outside this phase's
              scope.
              Bug fix / direct instruction: notification bell moved before
              search (previously search, then bell) -- plain JSX order
              swap, this row has no separate CSS order property either
              child relies on, so DOM order alone decides the visual
              left-to-right order in this flex row.
              Bug fix / direct instruction: px-4 -> px-6, matching the
              content area's own p-6 below -- the header's right edge sat
              noticeably closer to the viewport edge than the page content
              underneath it did, since the two used different horizontal
              padding scales for what should read as one consistent page
              margin running the full height of the admin shell. */}
          <div className="ml-auto flex items-center gap-2">
            <AdminNotificationBell />
            <AdminSearchBar />
          </div>
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
