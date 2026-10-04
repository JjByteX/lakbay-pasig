import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { clearGooglePending, hasGooglePending } from "@/lib/google-signin";

/**
 * Finishes a Google sign in after the redirect back to the app. Renders
 * nothing. Mounted once from App.tsx next to AuthModal.
 *
 * Mirrors the tail of login-form.tsx's handleSubmit, which cannot run for
 * Google since the page reloads on the way back (see lib/google-signin.ts):
 *   - staff or admin: write the signed_in activity log row (activity-log-
 *     plan.md, Auth Events; residents are not logged) and go to /admin.
 *   - resident: nothing. They are back on the page they started from,
 *     already signed in.
 *
 * It only acts when lib/google-signin.ts left its pending flag, so a normal
 * page load, a refresh, or an email sign in never triggers it. The flag is
 * consumed on the first look, so this runs at most once per Google attempt.
 *
 * Waits for `loading` to clear: auth-context.tsx sets session and profile
 * together before it does, so staff_role is known by then. If the person
 * cancelled at Google (or the account was an inactive staff account that
 * auth-context signed straight back out), there is no session, and the
 * flag is just cleared.
 */
export function GoogleReturnHandler() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !hasGooglePending()) return;
    clearGooglePending();

    if (!session || !profile?.staff_role) return;

    // Started with .then(), never awaited: supabase-js rpc() sends nothing
    // until something .then()s it, and logging must never block navigation.
    // Same call as login-form.tsx.
    void supabase.rpc("log_auth_event", { p_action: "signed_in" }).then(() => {});
    navigate("/admin");
  }, [loading, session, profile, navigate]);

  return null;
}
