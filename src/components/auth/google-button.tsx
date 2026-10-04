import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { clearGooglePending, startGoogleSignIn } from "@/lib/google-signin";

/**
 * "or" divider plus a Continue with Google button, rendered under the
 * email and password form in both login-form.tsx and signup-form.tsx. One
 * component for both because Google does not distinguish the two: an
 * unknown email becomes a new resident account (the same
 * handle_new_user() trigger as email signup), a known one just signs in.
 * That is why the label is "Continue with", not "Log in with".
 *
 * The G is Google's own four color mark, which their branding rules want
 * kept in color on a neutral button, so it is inline SVG here rather than
 * a Phosphor icon (those are single color).
 */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" className="shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleButton() {
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pressing Back from Google's page can restore this page from the
  // browser's back/forward cache with the button still stuck on
  // "Redirecting...". A restored page is a new attempt, so reset it and
  // drop the pending flag from the abandoned one.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (!e.persisted) return;
      setRedirecting(false);
      clearGooglePending();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function handleClick() {
    if (redirecting) return;
    setRedirecting(true);
    setError(null);

    const message = await startGoogleSignIn();
    if (message) {
      setError(message);
      setRedirecting(false);
    }
    // On success the browser is already leaving for Google, so the button
    // deliberately stays in its "Redirecting..." state.
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-3" role="separator">
        <span className="h-px flex-1 bg-border" />
        <span className="text-sm text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button type="button" variant="outline" className="w-full gap-2" onClick={handleClick} disabled={redirecting}>
        <GoogleLogo />
        {redirecting ? "Redirecting to Google..." : "Continue with Google"}
      </Button>

      {error && <p className="text-base text-destructive">{error}</p>}
    </div>
  );
}
