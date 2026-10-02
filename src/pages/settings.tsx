import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { useSettingsModal } from "@/lib/settings-modal";

/**
 * /profile/settings is no longer a page: Settings is a modal now
 * (components/settings-modal.tsx). This route stays only so old links and
 * bookmarks keep working: it opens the modal over Profile. A guest gets the
 * sign-in popup instead, same "locked, prompt to sign in" behavior the
 * page used to have.
 */
export default function SettingsPage() {
  const { session, loading } = useAuth();
  const { openAuth } = useAuthModal();
  const { openSettings } = useSettingsModal();

  useEffect(() => {
    if (loading) return;
    if (session) openSettings();
    else openAuth("login");
  }, [loading, session, openSettings, openAuth]);

  if (loading) return null;
  return <Navigate to="/profile" replace />;
}
