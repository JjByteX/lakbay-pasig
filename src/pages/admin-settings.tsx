import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useSettingsModal } from "@/lib/settings-modal";

/**
 * /admin/settings is no longer a page: Settings is the same modal the
 * resident view uses (components/settings-modal.tsx). This route stays only
 * so old links keep working: it opens the modal over the dashboard. No guest
 * check needed, every /admin route is already behind ProtectedRoute.
 */
export default function AdminSettingsPage() {
  const { openSettings } = useSettingsModal();

  useEffect(() => {
    openSettings();
  }, [openSettings]);

  return <Navigate to="/admin" replace />;
}
