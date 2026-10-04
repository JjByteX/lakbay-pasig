import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { clearGooglePending, fillProfileFromGoogle, hasGooglePending } from "@/lib/google-signin";

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
 *   - everyone: fill a blank Display Name and profile picture from the
 *     Google account (fillProfileFromGoogle), so a new account does not
 *     start with an empty name and a "?" avatar. Blanks only, nothing the
 *     person already set is overwritten. Runs after the staff redirect
 *     above has been started, never ahead of it, since copying the picture
 *     can take a moment.
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
  const { session, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !hasGooglePending()) return;
    clearGooglePending();

    if (!session) return;

    if (profile?.staff_role) {
      // Started with .then(), never awaited: supabase-js rpc() sends nothing
      // until something .then()s it, and logging must never block
      // navigation. Same call as login-form.tsx.
      void supabase.rpc("log_auth_event", { p_action: "signed_in" }).then(() => {});
      navigate("/admin");
    }

    // Pull the fresh row back into auth context once something was written,
    // so the sidebar and Profile show the name and picture right away
    // instead of on the next page load. A failure leaves the profile as it
    // was, which is exactly how it would have looked without this step.
    void fillProfileFromGoogle(session.user, profile).then((changed) => {
      if (changed) void refreshProfile();
    });
  }, [loading, session, profile, navigate, refreshProfile]);

  return null;
}
