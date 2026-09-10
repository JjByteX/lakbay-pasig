import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <AuthLayout tagline="Walk through history, guided by the people who kept it.">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
          <p className="text-base text-muted-foreground">
            We sent a confirmation link to {email}. Verify your email before logging in.
          </p>
          <Link to="/login" className="text-base text-primary underline">
            Back to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout tagline="Walk through history, guided by the people who kept it.">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-xl font-semibold text-foreground">Create your account</h1>

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
            {password.length > 0 && !passwordLongEnough && (
              <p className="text-base text-destructive">
                Password must be at least {MIN_PASSWORD_LENGTH} characters.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-base text-destructive">Passwords do not match.</p>
            )}
          </div>

          {error && <p className="text-base text-destructive">{error}</p>}

          <Button type="submit" disabled={!canSubmit}>
            {submitting ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="text-base text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary underline">
            Log in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
