import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuthModal } from "@/lib/auth-modal";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";

/**
 * landing-hero-phases.md Phase 5.8. Short form only, no image, no
 * carousel, no shared file with hero-carousel.tsx -- see
 * landing-hero-plan.md's Auth Popup section. Reads open/mode from
 * auth-modal.tsx's context and renders the matching form inside
 * DialogContent's existing centered card (already max-w-lg, already
 * rounded-2xl, per that component's own comment). No split layout, no
 * image slot, and no extra wrapper card around the form -- an inner card
 * here would violate ux-ui-guidelines.md's Card Nesting rule, since
 * DialogContent is already the one card this popup needs.
 *
 * Mounted once from App.tsx (Phase 5.9), so it survives every route
 * change the same way SignOutDialog and the account menu do -- but
 * unlike those, this one's open state lives in AuthModalProvider, not a
 * page-local useState, since it must be reachable from outside
 * PublicShell too (protected-route.tsx, the landing page).
 */
export function AuthModal() {
  const { open, mode, closeAuth } = useAuthModal();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeAuth()}>
      <DialogContent className="max-w-lg">
        {mode === "login" ? <LoginForm /> : <SignupForm />}
      </DialogContent>
    </Dialog>
  );
}
