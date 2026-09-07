import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth-context";
import type { SystemPermission } from "./auth-types";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Require profile.staff_role to be set (staff or admin), not just a session. */
  requireStaff?: boolean;
  /** Require this permission in system_permission, unless staff_role is admin (admin bypasses every permission check per admin-panel-spec.md). */
  requiredPermission?: SystemPermission;
}

export function ProtectedRoute({ children, requireStaff, requiredPermission }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  if ((requireStaff || requiredPermission) && !profile?.staff_role) {
    return <Navigate to="/" replace />;
  }

  // An Inactive staff account (admin-panel-spec.md's Staff section, set by
  // Admin) loses access to every staff-gated route immediately, same as
  // having no staff_role at all. auth-context.tsx also signs an Inactive
  // staff member out on load, so this mainly guards the moment between
  // "was active" and "session refreshes" rather than being the only check.
  if ((requireStaff || requiredPermission) && profile?.staff_role && profile.active_status === "inactive") {
    return <Navigate to="/" replace />;
  }

  if (requiredPermission && profile?.staff_role !== "admin" && !profile?.system_permission?.includes(requiredPermission)) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
