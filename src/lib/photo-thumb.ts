import { supabase } from "./supabase";

/**
 * Offline phases, Phase 2. Every photo uploaded to content-photos gets a
 * small copy beside it, named "<original path>.thumb.webp", so the offline
 * download can hold a thumbnail per record instead of a full photo (uploads
 * are accepted up to 5 MB and nothing resizes them).
 *
 * Same folder on purpose: the storage policies check the path (business id
 * for vendors, discovery/ for staff), so a separate thumbs/ folder would be
 * refused. The thumbnail path is derived from the photo url, no column holds
 * it. scripts/make-thumbs.mjs makes the same copy for photos that already
 * exist, with the same width and quality.
 */
export const THUMB_SUFFIX = ".thumb.webp";
const THUMB_WIDTH = 400;

export function thumbPath(path: string): string {
  return path + THUMB_SUFFIX;
}

export function thumbUrl(photoUrl: string): string {
  return photoUrl + THUMB_SUFFIX;
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function makeThumb(file: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const webp = await encode(canvas, "image/webp", 0.78);
    if (webp?.type === "image/webp") return webp;
    // A browser that cannot encode WebP hands back a PNG, which is bigger
    // than the photo. JPEG is smaller there.
    return await encode(canvas, "image/jpeg", 0.8);
  } finally {
    bitmap.close();
  }
}

/**
 * Best effort, never throws. The original is already uploaded when this runs,
 * so a failure here is logged and the save carries on. scripts/make-thumbs.mjs
 * fills any gap later.
 */
export async function uploadThumb(bucket: string, path: string, file: Blob): Promise<void> {
  try {
    const thumb = await makeThumb(file);
    if (!thumb) return;
    const { error } = await supabase.storage.from(bucket).upload(thumbPath(path), thumb, { contentType: thumb.type });
    if (error) console.error("Failed to upload photo thumbnail:", error.message);
  } catch (err) {
    console.error("Failed to make photo thumbnail:", err);
  }
}
