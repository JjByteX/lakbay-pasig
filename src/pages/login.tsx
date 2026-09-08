import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

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
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-xl font-semibold text-foreground">Log in</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-base font-semibold text-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-input bg-card px-4 py-2 text-base text-foreground"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-base font-semibold text-foreground">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-input bg-card px-4 py-2 text-base text-foreground"
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

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>

      <p className="text-base text-muted-foreground">
        Don't have an account?{" "}
        <Link to="/signup" className="text-primary underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
