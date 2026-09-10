import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const navigate = useNavigate();
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

    console.log("DEBUG 1: before signInWithPassword");
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    console.log("DEBUG 2: after signInWithPassword", { data, signInError });

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

    console.log("DEBUG 3: before profiles query", data.session.user.id);

    // staff_role, not role, is what actually gates /admin everywhere else
    // (see protected-route.tsx). role only distinguishes resident vs staff
    // account type, staff_role is null/staff/admin. Query directly here
    // instead of waiting on AuthProvider's own fetch, so navigate has a
    // value the same tick auth resolves.
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("staff_role")
        .eq("id", data.session.user.id)
        .single();

      console.log("DEBUG 4: after profiles query", { profile, profileError });

      navigate(profile?.staff_role ? "/admin" : "/");
    } catch (err) {
      console.log("DEBUG 5: profiles query threw", err);
    }
  }

  async function handleResend() {
    await supabase.auth.resend({ type: "signup", email });
    setResent(true);
  }

  return (
    <AuthLayout tagline="Walk through history, guided by the people who kept it.">
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
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          <Link to="/signup" className="text-primary underline">
            Create one
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
