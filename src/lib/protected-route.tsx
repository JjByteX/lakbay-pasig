import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth-context";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
