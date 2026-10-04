import { supabase } from "./supabase";

/**
 * Sign in with Google, as a third option next to email + password.
 *
 * Google sign in is a full page redirect (app -> Google -> Supabase ->
 * back to the app), so unlike login-form.tsx's password flow there is no
 * code that runs "right after sign in" in the same page. The app reloads
 * on the way back and AuthProvider (auth-context.tsx, untouched) simply
 * picks the new session up.
 *
 * What does need to survive the round trip is the one thing login-form.tsx
 * does after a password sign in: send a staff or admin account to /admin
 * and write the signed_in activity log row. A small sessionStorage flag,
 * set just before leaving and read by google-return-handler.tsx on the
 * way back, carries that. sessionStorage (not localStorage) for the same
 * reason entry-gate.tsx uses it: it should belong to this tab's visit only.
 *
 * The flag stores a timestamp and expires, so a stale flag from an
 * abandoned attempt can never send a later, unrelated session to /admin.
 */

const PENDING_KEY = "lakbay-google-signin-pending";
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

// Pages that only exist to host the sign in popup. Coming back to one of
// them after Google would re-open nothing useful, so those return to Home.
const AUTH_ONLY_PATHS = new Set(["/login", "/signup", "/welcome"]);

function getReturnUrl(): string {
  const { origin, pathname, search } = window.location;
  // Anywhere else, return to the exact page the person was on (a Discover
  // result, a trail...), matching login-form.tsx's "close the popup and
  // stay put" behavior for residents.
  return AUTH_ONLY_PATHS.has(pathname) ? `${origin}/` : `${origin}${pathname}${search}`;
}

export function markGooglePending(): void {
  try {
    sessionStorage.setItem(PENDING_KEY, String(Date.now()));
  } catch {
    // Storage blocked (private mode, etc). Sign in still works, the person
    // just lands where they were instead of being sent to /admin if staff.
  }
}

export function clearGooglePending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** True only for a recent, un-consumed Google sign in attempt. */
export function hasGooglePending(): boolean {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return false;
    const startedAt = Number(raw);
    return Number.isFinite(startedAt) && Date.now() - startedAt < PENDING_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * Starts the redirect to Google. Resolves with an error message only when
 * the redirect could not be started; on success the browser is already
 * navigating away and the promise's value no longer matters.
 */
export async function startGoogleSignIn(): Promise<string | null> {
  markGooglePending();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getReturnUrl(),
      // Always show the account chooser. This app assumes shared household
      // devices (see entry-gate.tsx), so silently reusing whichever Google
      // account the browser happens to be signed into would be wrong.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) {
    clearGooglePending();
    return "Could not start Google sign in. Please try again.";
  }

  return null;
}
