import { useState, type ChangeEvent } from "react";
import { CameraPlus, CircleNotch, X } from "@phosphor-icons/react";
import { validateAvatarFile } from "@/lib/avatar-storage";
import { discardUnsavedPhoto, uploadDiscoveryPhoto } from "@/lib/discovery-photo";
import { Label } from "@/components/ui/label";

/**
 * The one optional photo on a discovery content entry, used by both the
 * Discovery content tab and the trail builder's Trail Notes form. Same
 * single image tile as the landing slide form (slide-form-dialog.tsx). The
 * file uploads when picked and the form keeps only its url.
 *
 * `savedUrl` is the photo the entry already has. A url that differs from it
 * was uploaded in this edit, so replacing or removing it deletes that file
 * now. The saved one is only deleted by the caller after a save succeeds, so
 * cancelling never leaves an entry pointing at a deleted file.
 */
export function DiscoveryPhotoField({
  url,
  savedUrl,
  onChange,
  onError,
}: Readonly<{
  url: string;
  savedUrl: string | null;
  onChange: (url: string) => void;
  onError: (message: string | null) => void;
}>) {
  const [uploading, setUploading] = useState(false);

  async function handleSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validateAvatarFile(file);
    if (validationError) {
      onError(validationError);
      return;
    }

    setUploading(true);
    onError(null);
    try {
      const nextUrl = await uploadDiscoveryPhoto(file);
      discardUnsavedPhoto(url, savedUrl);
      onChange(nextUrl);
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    discardUnsavedPhoto(url, savedUrl);
    onChange("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Photo</Label>
      {url ? (
        <div className="relative h-24 w-24 overflow-hidden rounded-md border border-border">
          <img src={url} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute right-1 top-1 rounded-md bg-foreground/60 p-1 text-background"
          >
            <X className="h-3 w-3" />
            <span className="sr-only">Remove photo</span>
          </button>
        </div>
      ) : (
        <label
          htmlFor="discovery-photo-upload"
          className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input text-muted-foreground hover:bg-muted"
        >
          {uploading ? <CircleNotch className="h-5 w-5 animate-spin" /> : <CameraPlus className="h-5 w-5" />}
          <span className="text-xs">{uploading ? "Uploading…" : "Add"}</span>
          <input
            id="discovery-photo-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleSelected}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}
