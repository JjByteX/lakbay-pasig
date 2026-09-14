import { supabase } from "./supabase";

// Phase 6.3/6.4: storage bucket for profile pictures. Not yet created by
// any migration in this repo, same "flagged, not silently invented" status
// as admin-place-detail.tsx's own PHOTO_BUCKET ("place-photos") -- bucket
// creation is a Supabase dashboard/migration step outside this phase's
// file scope, per architecture-notes.md's "what must never be touched
// without approval" (schema changes) and decision-log.md entry #12's own
// storage decision. Create a public bucket named "avatars" before this
// upload flow can succeed end to end.
export const AVATAR_BUCKET = "avatars";

// Phase 6.8: one shared avatar size scale, referenced everywhere an
// Avatar renders a profile picture, so sidebar/top bar/profile
// page/staff form never drift to a different size per screen again
// (admin-sidebar.tsx was h-8 w-8, public-shell.tsx was h-9 w-9 before
// this phase -- both now read from here instead of a locally hardcoded
// value, per ux-ui-guidelines.md's Consistency Rules: "if a value is
// used once, it must be reused everywhere that context applies").
export const AVATAR_SIZE = {
  /** Sidebar footer, table rows -- compact chrome context. */
  sm: "h-8 w-8",
  /** Top bar account menu -- same as sm today but named separately so a
   *  future top-bar-specific size change doesn't have to touch sm's
   *  other callers. */
  md: "h-9 w-9",
  /** Profile page, staff form -- the picture is the subject, not chrome. */
  lg: "h-20 w-20",
} as const;

// Public URLs look like ".../storage/v1/object/public/<bucket>/<path>".
// profiles.profile_picture only stores the public URL (see uploadAvatar),
// not the raw path, so deleting the file requires recovering <path> from
// it -- identical helper to admin-place-detail.tsx's
// getStoragePathFromPublicUrl, kept as its own copy since that one is
// hardcoded to PHOTO_BUCKET and page-local, not exported.
function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(publicUrl.slice(index + marker.length));
}

// Phase 6.7: specific error states, not a generic "upload failed" line.
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function validateAvatarFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return "Please choose a JPG, PNG, WEBP, or GIF image.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "That image is larger than 5MB. Please choose a smaller file.";
  }
  return null;
}

/**
 * Uploads a validated file to the avatars bucket and returns its public
 * URL. Path shape `{ownerId}/{uuid}-{filename}` per decision-log.md entry
 * #12 -- one picture per profile, no photoType segment needed (unlike
 * place_photos' historical/current split).
 *
 * Does not touch the profiles row -- the caller writes profile_picture
 * itself, same division of responsibility as admin-place-detail.tsx's
 * handlePhotoSelected (upload here, insert/update there).
 */
export async function uploadAvatar(ownerId: string, file: File): Promise<string> {
  const path = `${ownerId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Removes the underlying storage object for a previously-uploaded avatar
 * URL. Best-effort, same as admin-place-detail.tsx's handleRemovePhoto:
 * a failure here is logged, not thrown, since the profiles row (the part
 * the rest of the app reads) is the source of truth and should still be
 * cleared by the caller either way.
 */
export async function removeAvatarFile(publicUrl: string): Promise<void> {
  const path = storagePathFromPublicUrl(publicUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) {
    console.error("Failed to remove avatar from storage:", error.message);
  }
}
