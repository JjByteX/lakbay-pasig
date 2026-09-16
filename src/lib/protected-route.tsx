import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth-context";
import type { SystemPermission } from "./auth-types";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Require profile.staff_role to be set (staff or admin), not just a session. */
  requireStaff?: boolean;
  /** Require profile.staff_role to be exactly admin. Used for the Staff section, per admin-panel-spec.md, Staff role has no access there. */
  requireAdmin?: boolean;
  /**
   * Require this permission in system_permission, unless staff_role is
   * admin (admin bypasses every permission check per admin-panel-spec.md).
   * Pass an array for an "any of" gate — e.g. the Categories route (Phase
   * 2.2), where any one of Places/Trails/Announcements' own permission
   * qualifies someone to open the page at all, per the plan doc's tab
   * visibility model. A single SystemPermission still works exactly as
   * before, every existing call site is unaffected.
   */
  requiredPermission?: SystemPermission | SystemPermission[];
}

export function ProtectedRoute({ children, requireStaff, requireAdmin, requiredPermission }: Readonly<ProtectedRouteProps>) {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  // The one exception to landing-hero-phases.md Phase 7's guest-gate
  // migration (7.12): every other guest gate now calls openAuth("login")
  // to open the popup in place, but this keeps a real redirect to /login.
  // A route-level redirect has no "in place" to return to -- there is no
  // page underneath yet, since the protected page itself never rendered.
  // /login (App.tsx) opens the landing page with the popup already open
  // over it, which is exactly landing-hero-plan.md's Flagged Conflict #4:
  // /login stays a real route so a hard-gated admin URL has somewhere sane
  // to land.
  if (!session) return <Navigate to="/login" replace />;

  if ((requireStaff || requireAdmin || requiredPermission) && !profile?.staff_role) {
    return <Navigate to="/" replace />;
  }

  // An Inactive staff account (admin-panel-spec.md's Staff section, set by
  // Admin) loses access to every staff-gated route immediately, same as
  // having no staff_role at all. auth-context.tsx also signs an Inactive
  // staff member out on load, so this mainly guards the moment between
  // "was active" and "session refreshes" rather than being the only check.
  if ((requireStaff || requireAdmin || requiredPermission) && profile?.staff_role && profile.active_status === "inactive") {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin && profile?.staff_role !== "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (requiredPermission && profile?.staff_role !== "admin") {
    const required = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
    const hasAny = required.some((p) => profile?.system_permission?.includes(p));
    if (!hasAny) return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
