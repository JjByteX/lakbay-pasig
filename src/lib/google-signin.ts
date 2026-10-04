import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile } from "./auth-types";
import { uploadAvatar, validateAvatarFile } from "./avatar-storage";

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

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Copies Google's profile picture into the avatars bucket, so it behaves
 * exactly like an uploaded photo (profile.tsx's Change photo and Remove
 * both work, and nothing depends on Google's image host staying up or
 * allowing hotlinking). Returns the stored URL.
 *
 * Falls back to Google's own image URL when the copy cannot be done: the
 * avatars bucket was created by hand, not by a migration (avatar-storage.ts
 * says so), Google's image host may refuse a cross origin read, or the
 * file may fail validateAvatarFile. A hotlinked picture still shows, and
 * removeAvatarFile ignores a URL that is not in the bucket, so a later
 * Change photo or Remove is harmless either way.
 */
async function storeGooglePicture(userId: string, googleUrl: string): Promise<string> {
  try {
    // Google sizes the image by a "=s96-c" style suffix. Ask for a larger
    // one so it stays sharp at the 80px profile size.
    const response = await fetch(googleUrl.replace(/=s\d+-c$/, "=s256-c"));
    if (!response.ok) return googleUrl;

    const blob = await response.blob();
    const extension = blob.type.split("/")[1] || "jpg";
    const file = new File([blob], `google-avatar.${extension}`, { type: blob.type });
    if (validateAvatarFile(file)) return googleUrl;

    return await uploadAvatar(userId, file);
  } catch {
    return googleUrl;
  }
}

/**
 * After a Google sign in, fills in the profile details Google already
 * knows so the account does not start blank (an empty Display Name shows
 * as "Account" in the sidebar and the avatar as "?").
 *
 * Fills blanks only. A name or picture the person already set, by hand or
 * on an earlier visit, is never overwritten, so this is safe to run on
 * every Google sign in. Display Name only, not First/Last Name: Supabase
 * keeps Google's full name as one string, and splitting it would guess
 * wrong for names like "Juan dela Cruz", so those stay the person's own to
 * fill in under Settings, Account.
 *
 * Sends only display_name and profile_picture. Never role, staff_role or
 * any other protected column, matching 0001's rule that the app layer must
 * not send those in a self-update. profiles_update_own (0001) already
 * allows this write. Returns true when the row changed.
 */
export async function fillProfileFromGoogle(user: User, profile: Profile | null): Promise<boolean> {
  if (!profile) return false;

  const identity = user.identities?.find((item) => item.provider === "google");
  const providers: unknown = user.app_metadata?.providers;
  const signedInWithGoogle = !!identity || (Array.isArray(providers) && providers.includes("google"));
  if (!signedInWithGoogle) return false;

  const data = identity?.identity_data ?? user.user_metadata ?? {};
  const name = firstText(data.full_name, data.name);
  const picture = firstText(data.avatar_url, data.picture);

  const patch: { display_name?: string; profile_picture?: string } = {};
  // 150 matches the Display Name field's own maxLength in profile.tsx.
  if (!profile.display_name && name) patch.display_name = name.slice(0, 150);
  if (!profile.profile_picture && picture) patch.profile_picture = await storeGooglePicture(user.id, picture);

  if (Object.keys(patch).length === 0) return false;

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  return !error;
}
