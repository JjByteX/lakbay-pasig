import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthModal } from "@/lib/auth-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

/**
 * landing-hero-phases.md Phase 5.4-5.6. Body moved verbatim from the
 * deleted pages/login.tsx: same signInWithPassword call, same shared
 * error string, same unverified branch, same resend, same staff_role
 * lookup and its try/catch fallback. Not reshaped while moving, per
 * decision-log #16's standing rule.
 *
 * What changed from pages/login.tsx: the AuthLayout wrapper and its
 * tagline prop are dropped entirely (they only existed to hold the split-
 * screen image, which no longer exists anywhere in the app). The success
 * path now closes the popup instead of only navigating -- staff still
 * lands on /admin, a resident just closes and stays put, which is the
 * point of the whole change (see landing-hero-plan.md's Auth Popup, After
 * success). "Create one" becomes a mode switch instead of a Link.
 *
 * "Continue as Guest" is back in this form (post-launch addition, not in
 * the original landing-hero-plan.md): the popup opens from many places
 * across the app (Discover, a trail, Saved...), not only the landing
 * page, so a guest who opens Log in and changes their mind needs a way
 * back to just browsing without it, from wherever they are. Uses
 * closeAuth(), the same "opened over a page" branch landing-hero-plan.md's
 * Auth Popup > Cross Links already specifies -- on /login specifically
 * this still resolves correctly since AuthModalRoute renders the landing
 * page underneath, so closing lands the person there. Login only, not
 * signup: signup is a deliberate commit step, matching the common pattern
 * of not offering a guest escape mid-signup.
 */
export function LoginForm() {
  const navigate = useNavigate();
  const { closeAuth, setMode } = useAuthModal();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  const canSubmit = email.length > 0 && password.length > 0 && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    setUnverified(false);
    setResent(false);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (signInError) {
      if (signInError.message.toLowerCase().includes("email not confirmed")) {
        setUnverified(true);
        return;
      }
      // Shared, unspecific message on purpose. Do not reveal whether the
      // email exists or the password was wrong, that is a security leak.
      setError("Incorrect email or password.");
      return;
    }

    if (!data.session) {
      setError("Incorrect email or password.");
      return;
    }

    // staff_role, not role, is what actually gates /admin everywhere else
    // (see protected-route.tsx). role only distinguishes resident vs staff
    // account type, staff_role is null/staff/admin. Query directly here
    // instead of waiting on AuthProvider's own fetch, so navigate has a
    // value the same tick auth resolves.
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("staff_role")
        .eq("id", data.session.user.id)
        .single();

      // Staff and admin sign-ins are logged, residents are not
      // (activity-log-plan.md, Auth Events). The call has to be started, not
      // just built: supabase-js rpc() sends nothing until something .then()s
      // it. Never awaited and it cannot reject, so logging never blocks login.
      if (profile?.staff_role) {
        void supabase.rpc("log_auth_event", { p_action: "signed_in" }).then(() => {});
      }

      closeAuth();
      if (profile?.staff_role) {
        navigate("/admin");
      }
      // Resident: closeAuth() only, no navigation, per 5.5 -- whatever
      // page the popup opened over (a Discover result, a trail) is what
      // the person sees next, still there, now signed in.
    } catch {
      // Profile lookup failed; close anyway rather than leaving the
      // popup stuck open. Sign-in itself already succeeded
      // (data.session is set), so this is a best-effort role check only,
      // not something worth surfacing as a login error.
      closeAuth();
    }
  }

  async function handleResend() {
    await supabase.auth.resend({ type: "signup", email });
    setResent(true);
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-xl font-semibold text-foreground">Log in</h1>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={150}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
          />
        </div>

        {unverified && (
          <div className="flex flex-col gap-2 rounded-lg bg-muted p-4">
            <p className="text-base text-foreground">
              Verify your email before logging in. Check your inbox for the confirmation link.
            </p>
            {resent ? (
              <p className="text-base text-muted-foreground">Confirmation email resent.</p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="text-left text-base text-primary underline"
              >
                Resend confirmation email
              </button>
            )}
          </div>
        )}

        {error && <p className="text-base text-destructive">{error}</p>}

        <Button type="submit" disabled={!canSubmit}>
          {submitting ? "Logging in..." : "Log in"}
        </Button>
      </form>

      <p className="text-base text-muted-foreground">
        Don't have an account?{" "}
        <button type="button" onClick={() => setMode("signup")} className="text-primary underline">
          Create one
        </button>
      </p>

      <button type="button" onClick={() => closeAuth()} className="text-sm text-muted-foreground underline">
        Continue as Guest
      </button>
    </div>
  );
}
