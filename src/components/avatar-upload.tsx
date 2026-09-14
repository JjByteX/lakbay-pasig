import { useState, type ChangeEvent } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AVATAR_SIZE, uploadAvatar, removeAvatarFile, validateAvatarFile } from "@/lib/avatar-storage";

// Phase 6.4-6.7: one shared upload control for profile.tsx (Registered
// User, Vendor) and staff-form-dialog.tsx (Admin, editing an existing
// staff account). Building this twice -- once per caller -- would be
// exactly the "parallel version of something that exists" constraints.md's
// Inventory Before Suggesting rule warns against, since both callers need
// the identical states pass (6.7): uploading, success, error (wrong
// type, too large), and remove.
//
// ownerId is the profiles.id row this picture belongs to -- staff-form-
// dialog.tsx only renders this once staffId is known (edit mode only, a
// brand new staff row has no id yet to key the storage path on, matching
// data-model.md's Profile Picture being optional, not part of account
// creation).
interface AvatarUploadProps {
  ownerId: string;
  displayName: string | null;
  currentUrl: string | null;
  /** Called with the new public URL after a successful upload, or null
   *  after a successful remove -- the caller owns writing this to its own
   *  form state / profiles row, same division of responsibility
   *  avatar-storage.ts's own header comment describes for uploadAvatar. */
  onChange: (url: string | null) => void;
}

export function AvatarUpload({ ownerId, displayName, currentUrl, onChange }: Readonly<AvatarUploadProps>) {
  const [status, setStatus] = useState<"idle" | "uploading" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputId = `avatar-upload-${ownerId}`;
  const initial = displayName?.[0]?.toUpperCase() ?? "?";

  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setStatus("uploading");
    setError(null);

    try {
      const url = await uploadAvatar(ownerId, file);
      // Old file, if any, is orphaned in storage once profile_picture no
      // longer points to it -- same best-effort cleanup admin-place-
      // detail.tsx's handleRemovePhoto does, run here so a replace (not
      // just an explicit remove) doesn't leak a file either.
      if (currentUrl) {
        await removeAvatarFile(currentUrl);
      }
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setStatus("idle");
    }
  }

  async function handleRemove() {
    if (!currentUrl) return;
    setStatus("removing");
    setError(null);
    await removeAvatarFile(currentUrl);
    onChange(null);
    setStatus("idle");
  }

  const busy = status !== "idle";

  return (
    <div className="flex items-center gap-4">
      <Avatar className={AVATAR_SIZE.lg}>
        {currentUrl && <AvatarImage src={currentUrl} alt="" />}
        <AvatarFallback className="text-2xl">
          {status === "uploading" ? <Loader2 className="h-6 w-6 animate-spin" /> : initial}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {/* h-8 px-3, same size token Button's own "sm" variant uses
              (button.tsx), kept as a <label> rather than that Button
              component since a native label-wrapping-a-hidden-file-input
              is what makes the input keyboard/screen-reader reachable via
              its own text, not a styling choice. */}
          <label
            htmlFor={inputId}
            className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            {currentUrl ? "Change photo" : "Upload photo"}
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleSelect}
              disabled={busy}
            />
          </label>
          {currentUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={busy}>
              {status === "removing" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, or GIF. Up to 5MB.</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
