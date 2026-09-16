import { supabase } from "./supabase";
import { validateAvatarFile } from "./avatar-storage";

/**
 * Phase 2 of landing-hero-phases.md. Data access for landing_slides
 * (migration 0033). Not built on category-crud.ts's factory: that
 * factory is fixed to the id/name/icon/active shape with no delete and
 * no reorder, and a slide carries an image plus a caption plus an
 * editable order instead, so forcing the fit costs more than this file.
 *
 * Bucket, path prefix, and error handling all match
 * admin-place-detail.tsx's handlePhotoSelected/handleRemovePhoto shape
 * (upload, get public URL, insert row; delete row, then best-effort
 * delete the object). File validation reuses avatar-storage.ts's
 * validateAvatarFile rather than a second copy of the same cap and type
 * set, per landing-hero-phases.md 2.8 -- only fork it if this surface
 * ever needs different limits.
 */

const PHOTO_BUCKET = "content-photos";

export interface LandingSlide {
  id: string;
  image_url: string;
  caption: string;
  sort_order: number;
  active: boolean;
}

const SLIDE_COLUMNS = "id, image_url, caption, sort_order, active";

/** Active slides only, in carousel order. What the public hero calls. */
export async function fetchActiveSlides(): Promise<LandingSlide[]> {
  const { data, error } = await supabase
    .from("landing_slides")
    .select(SLIDE_COLUMNS)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** Every slide, active or not, in carousel order. What admin calls. */
export async function fetchAllSlides(): Promise<LandingSlide[]> {
  const { data, error } = await supabase
    .from("landing_slides")
    .select(SLIDE_COLUMNS)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export interface SlideFormInput {
  image_url: string;
  caption: string;
  active: boolean;
}

/** New slide goes to the end of the current order. */
export async function createSlide(input: SlideFormInput, currentCount: number): Promise<void> {
  const { error } = await supabase.from("landing_slides").insert({ ...input, sort_order: currentCount });
  if (error) throw error;
}

export async function updateSlide(id: string, input: SlideFormInput): Promise<void> {
  const { error } = await supabase.from("landing_slides").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteSlide(id: string): Promise<void> {
  const { error } = await supabase.from("landing_slides").delete().eq("id", id);
  if (error) throw error;
}

/** Writes each id's array index as its sort_order, in the order given. */
export async function reorderSlides(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("landing_slides").update({ sort_order: index }).eq("id", id)
    )
  );
}

/**
 * Same cap and accepted-type check every other upload surface in this
 * app uses. Re-exported here so callers only need one import from this
 * file rather than reaching into avatar-storage.ts directly for a check
 * that has nothing to do with avatars.
 */
export const validateSlideFile = validateAvatarFile;

/**
 * Public URLs look like ".../storage/v1/object/public/<bucket>/<path>".
 * landing_slides.image_url only stores the public URL, not the raw path,
 * so deleting the file requires recovering <path> from it. Same helper
 * shape as admin-place-detail.tsx's getStoragePathFromPublicUrl and
 * avatar-storage.ts's storagePathFromPublicUrl, kept as its own copy
 * since both of those are bucket-specific and not exported for reuse.
 */
function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(publicUrl.slice(index + marker.length));
}

/**
 * Uploads a validated file to content-photos under the landing/ prefix
 * and returns its public URL. Does not touch the landing_slides row --
 * the caller creates or updates the row itself, same division of
 * responsibility as uploadAvatar/handlePhotoSelected.
 */
export async function uploadSlideImage(file: File): Promise<string> {
  const path = `landing/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Removes the underlying storage object for a previously-uploaded slide
 * image. Best-effort, same as handleRemovePhoto/removeAvatarFile: a
 * failure here is logged, not thrown, since the landing_slides row (the
 * part the rest of the app reads) is the source of truth and should
 * still be removed by the caller either way.
 */
export async function removeSlideFile(publicUrl: string): Promise<void> {
  const path = storagePathFromPublicUrl(publicUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) {
    console.error("Failed to remove landing slide image from storage:", error.message);
  }
}
