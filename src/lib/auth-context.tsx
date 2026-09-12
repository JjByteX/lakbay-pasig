import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Profile } from "./auth-types";

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

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, role, staff_role, active_status, display_name, contact_number, date_of_birth, preferred_language, preferred_categories, position, system_permission"
    )
    .eq("id", userId)
    .single();

  if (error) return null;
  return data as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
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
          setLoading(false);
          return;
        }
        setSession(data.session);
        setProfile(loadedProfile);
      } else {
        setSession(data.session);
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
          return;
        }
        setSession(newSession);
        setProfile(loadedProfile);
      } else {
        setSession(newSession);
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  // Step 8, Phase 0.8: lets a page that just wrote to profiles (Profile's
  // own save action) pull the fresh row back into context, instead of
  // waiting for the next full session load. Signed-out call is a no-op,
  // there's no profile to refresh.
  async function refreshProfile() {
    if (!session) return;
    const loadedProfile = await fetchProfile(session.user.id);
    setProfile(loadedProfile);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
