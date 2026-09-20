import { createContext, useContext, useEffect, useMemo, useCallback, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile } from "./auth-types";
import { applyTheme, applyFontSize } from "./preferences";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// active_status only has defined meaning for staff accounts per
// admin-panel-spec.md's Staff section (Admin sets Active/Inactive on other
// CATO Staff). A resident's active_status is not a concept used anywhere,
// so this intentionally does not apply to profile?.staff_role === null.
function isInactiveStaff(profile: Profile | null): boolean {
  return !!profile?.staff_role && profile.active_status === "inactive";
}

// Phase 1.3/1.4: applies both preferences from a resolved profile.
// A null profile (guest, signed out, or a just-signed-out inactive
// staff account) has no row to read, so this passes null through to
// each function, which already resolves null to its own default
// (light, default font size) per preferences.ts's Phase 1.2 handling.
function applyPreferences(profile: Profile | null): void {
  applyTheme(profile?.theme_preference ?? null);
  applyFontSize(profile?.font_size_preference ?? null);
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, role, staff_role, active_status, display_name, first_name, last_name, username, profile_picture, contact_number, date_of_birth, preferred_categories, position, system_permission, theme_preference, font_size_preference"
    )
    .eq("id", userId)
    .single();

  if (error) return null;
  return data as Profile;
}

async function signOut() {
  await supabase.auth.signOut();
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const loadedProfile = await fetchProfile(data.session.user.id);
        if (isInactiveStaff(loadedProfile)) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          applyPreferences(null);
          setLoading(false);
          return;
        }
        setSession(data.session);
        setProfile(loadedProfile);
        applyPreferences(loadedProfile);
      } else {
        setSession(data.session);
        applyPreferences(null);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (newSession) {
        const loadedProfile = await fetchProfile(newSession.user.id);
        if (isInactiveStaff(loadedProfile)) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          applyPreferences(null);
          return;
        }
        setSession(newSession);
        setProfile(loadedProfile);
        applyPreferences(loadedProfile);
      } else {
        setSession(newSession);
        setProfile(null);
        applyPreferences(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Step 8, Phase 0.8: lets a page that just wrote to profiles (Profile's
  // own save action) pull the fresh row back into context, instead of
  // waiting for the next full session load. Signed-out call is a no-op,
  // there's no profile to refresh.
  //
  // SonarQube flagged the Provider's value object being rebuilt on every
  // render (L96), same fix shape as public-shell.tsx's
  // GlobalSearchContext.Provider (formerly TopBarSlotContext.Provider,
  // renamed when global search replaced the per-page top bar slot) and
  // sidebar.tsx's SidebarContext.Provider, both already in this codebase:
  // wrap the value in useMemo, and wrap any function inside that value in
  // useCallback so its own reference stays stable across renders unless
  // something it actually reads changes. refreshProfile reads session, so
  // it depends on it here.
  const refreshProfile = useCallback(async () => {
    if (!session) return;
    const loadedProfile = await fetchProfile(session.user.id);
    setProfile(loadedProfile);
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, profile, loading, signOut, refreshProfile }),
    [session, profile, loading, signOut, refreshProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
