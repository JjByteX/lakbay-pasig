import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import HomePage from "@/pages/home";

/**
 * Root ("/") entry gate. A signed-out visitor's first hit of the app in a
 * given browser session lands on /welcome (Get started / Log in /
 * Continue as Guest) instead of straight into the Home feed underneath
 * PublicShell. This does not reopen landing-hero-plan.md's Flagged
 * Conflict #1 (Home stays the real "/" content, not a permanent splash
 * wall) -- it's a one-time redirect, not a gate: once redirected (or once
 * signed in, or once "Continue as Guest" is tapped, which is a plain
 * Link to "/" per landing.tsx), "/" resolves straight to Home again for
 * the rest of the browser session, same as before this change.
 *
 * sessionStorage, not localStorage: this should re-trigger on a fresh
 * session (new tab restored after the browser fully closed counts,
 * matching the household-shared-device assumption elsewhere in the app,
 * e.g. auth-context.tsx's own signed-out-on-inactive handling), not
 * follow the person indefinitely across visits like a persistent flag
 * would.
 *
 * `loading` guard matches protected-route.tsx's and saved.tsx's own
 * `if (loading) return null` -- session starts null even for an
 * already-signed-in user until auth-context.tsx's initial getSession()
 * resolves, so this must not redirect a signed-in user to /welcome for a
 * flash before that resolves.
 */
const ENTRY_REDIRECT_KEY = "lakbay-entry-redirected";

export function EntryGate() {
  const { session, loading } = useAuth();

  if (loading) return null;

  if (!session) {
    const alreadyRedirected = sessionStorage.getItem(ENTRY_REDIRECT_KEY) === "1";
    if (!alreadyRedirected) {
      sessionStorage.setItem(ENTRY_REDIRECT_KEY, "1");
      return <Navigate to="/welcome" replace />;
    }
  }

  return <HomePage />;
}
