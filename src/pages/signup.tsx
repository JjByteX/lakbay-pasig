import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 8;

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = email.length > 0 && passwordLongEnough && passwordsMatch && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    const { error: signUpError } = await supabase.auth.signUp({ email, password });

    setSubmitting(false);

    if (signUpError) {
      if (signUpError.message.toLowerCase().includes("already registered")) {
        setError("An account with this email already exists. Try logging in instead.");
      } else {
        setError(signUpError.message);
      }
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
        <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
        <p className="text-base text-muted-foreground">
          We sent a confirmation link to {email}. Verify your email before logging in.
        </p>
        <Link to="/login" className="text-base text-primary underline">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-xl font-semibold text-foreground">Create your account</h1>

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
          {password.length > 0 && !passwordLongEnough && (
            <p className="text-base text-destructive">
              Password must be at least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="confirm-password" className="text-base font-semibold text-foreground">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-lg border border-input bg-card px-4 py-2 text-base text-foreground"
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-base text-destructive">Passwords do not match.</p>
          )}
        </div>

        {error && <p className="text-base text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="text-base text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
