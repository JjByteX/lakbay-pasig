import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Log-out confirmation, shared by every sign-out trigger in the app
// (public-shell.tsx's account menu, profile.tsx's Sign out button,
// admin-sidebar.tsx's footer icon). One component rather than three
// copies, per constraints.md's Inventory Before Suggesting rule: unlike
// vendor-items.tsx's delete dialog or admin-business-detail.tsx's
// verify/reject dialog (each page-local since their copy and fields
// differ per caller), this dialog's title, description, and both button
// labels are identical everywhere it's used, so a shared component is
// the same content once instead of three, not a new abstraction over
// varying content. Same Dialog composition those page-local dialogs
// already established (a focused, single-viewport decision, per ux-ui-
// guidelines.md's Modal vs panel rule), same Cancel/confirm button
// shape and disabled-while-pending state as vendor-items.tsx's delete
// confirmation.
//
// Controlled open/onOpenChange, matching staff-form-dialog.tsx's own
// controlled-dialog shape, so each caller owns exactly when the trigger
// opens it (a menu item's onClick, a button's onClick) without this
// component reaching into any page's own state.
export function SignOutDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleConfirm() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !signingOut && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign out?</DialogTitle>
          <DialogDescription>
            You'll need to sign in again to access your account.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={signingOut}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
