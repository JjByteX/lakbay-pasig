import { useEffect } from "react";
import { useAuthModal, type AuthModalMode } from "@/lib/auth-modal";
import LandingPage from "@/pages/landing";

/**
 * landing-hero-phases.md Phase 6.8. Opens the shared popup in the given
 * mode on mount, with the landing page rendered underneath so the popup
 * has a surface to sit on (per landing-hero-plan.md's Flagged Conflicts
 * #4: /login and /signup stay routes for Supabase email links,
 * protected-route.tsx's redirect target, and existing bookmarks, but no
 * longer render their own page -- they open the popup over whatever
 * would otherwise be there, defaulting to the landing page when nothing
 * else is).
 *
 * Before Phase 6 this rendered null (Phase 5's "temporary trigger,"
 * nothing behind it yet since landing.tsx didn't exist). Kept as its own
 * file rather than inlined in App.tsx so a future third surface (if any)
 * behind /login or /signup is a one-line change here, not a restructure
 * of App.tsx's route table.
 */
export function AuthModalRoute({ mode }: Readonly<{ mode: AuthModalMode }>) {
  const { openAuth } = useAuthModal();

  useEffect(() => {
    openAuth(mode);
    // Deliberately only on mount: openAuth is stable identity-wise across
    // this component's short lifetime, and re-running on every render
    // would re-open the popup after the person closes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <LandingPage />;
}
