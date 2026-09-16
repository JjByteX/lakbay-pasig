import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthModal } from "@/lib/auth-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

const MIN_PASSWORD_LENGTH = 8;

/**
 * landing-hero-phases.md Phase 5.7. Body moved verbatim from the deleted
 * pages/signup.tsx: same signUp call, same "already registered" branch,
 * same password length and match checks, same submitted/inbox state.
 * Not reshaped while moving, per decision-log #16's standing rule.
 *
 * What changed from pages/signup.tsx: the AuthLayout wrapper is dropped
 * entirely, same reasoning as login-form.tsx. The submitted state's "Back
 * to login" link becomes a mode switch, and the form's own "Already have
 * an account?" link becomes a mode switch too, both staying inside this
 * same popup instead of navigating to a route. Per landing-hero-plan.md's
 * Auth Popup, the submitted state does not close the modal on its own,
 * since the person still has to go read an email.
 */
export function SignupForm() {
  const { setMode } = useAuthModal();

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
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
        <p className="text-base text-muted-foreground">
          We sent a confirmation link to {email}. Verify your email before logging in.
        </p>
        <button type="button" onClick={() => setMode("login")} className="text-base text-primary underline">
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-xl font-semibold text-foreground">Create your account</h1>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={150}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="signup-password">Password</Label>
          <PasswordInput
            id="signup-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
          />
          {password.length > 0 && !passwordLongEnough && (
            <p className="text-base text-destructive">
              Password must be at least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="signup-confirm-password">Confirm password</Label>
          <PasswordInput
            id="signup-confirm-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            maxLength={72}
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
        <button type="button" onClick={() => setMode("login")} className="text-primary underline">
          Log in
        </button>
      </p>
    </div>
  );
}
