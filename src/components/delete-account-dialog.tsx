import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useSettingsModal } from "@/lib/settings-modal";
import { removeAvatarFile } from "@/lib/avatar-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Delete account confirmation, opened from Settings > Account
// (settings-sections.tsx). Residents only: the button is not rendered for staff
// or admin, and delete_my_account() (migration 0049) refuses them as well.
//
// Same controlled-dialog shape and Cancel/destructive buttons as
// sign-out-dialog.tsx. Unlike sign out, this cannot be undone, so the button
// stays disabled until DELETE is typed (case does not matter, since mobile
// keyboards capitalize the first letter on their own).
//
// Order matters. The function runs first, so a refusal (an account with a
// business listing) leaves everything as it was, including the profile picture.
// Only after it succeeds is the picture's file removed from storage, which still
// works because the access token stays valid until it expires even though the
// account is gone. A failed removal is logged, not thrown (avatar-storage.ts).
// Then the local session is cleared directly, not through useAuth().signOut,
// whose signed_out log call would go out under an account that no longer exists.
function messageFor(error: string): string {
  if (error.includes("has_business")) {
    return "This account has a business listing, so it can't be deleted here. Contact CATO to have the listing removed first.";
  }
  if (error.includes("staff_account")) {
    return "Staff accounts can't be deleted here.";
  }
  return "Couldn't delete your account. Please try again.";
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { profile } = useAuth();
  const { closeSettings } = useSettingsModal();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmation.trim().toLowerCase() === "delete";

  function handleOpenChange(next: boolean) {
    if (deleting) return;
    if (!next) {
      setConfirmation("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleDelete() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError(null);

    const { error: deleteError } = await supabase.rpc("delete_my_account");
    if (deleteError) {
      setDeleting(false);
      setError(messageFor(deleteError.message));
      return;
    }

    if (profile?.profile_picture) await removeAvatarFile(profile.profile_picture);
    await supabase.auth.signOut({ scope: "local" });
    closeSettings();
    navigate("/");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account?</DialogTitle>
          <DialogDescription>
            This permanently deletes your account, saved places and businesses, trail progress and hidden
            items. It can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-account-confirm">Type DELETE to confirm</Label>
          <Input
            id="delete-account-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            disabled={deleting}
          />
        </div>

        {error && <p className="text-base text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!confirmed || deleting} loading={deleting}>
            {deleting ? "Deleting..." : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
