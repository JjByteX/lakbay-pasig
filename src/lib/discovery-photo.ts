import { supabase } from "./supabase";

/**
 * The one optional photo on a discovery content entry (migration 0051).
 * Uploaded when staff pick the file, so the form only holds a public url,
 * the same flow the landing slide image uses (landing-slides.ts). A file is
 * only real once its entry is saved, so every path that leaves an unsaved
 * upload behind (replace, remove, cancel) cleans it up, best effort.
 */
const BUCKET = "content-photos";

// Public urls look like ".../object/public/<bucket>/<path>", and only the
// url is stored, so deleting the file means recovering the path from it.
function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(publicUrl.slice(index + marker.length));
}

export async function uploadDiscoveryPhoto(file: File): Promise<string> {
  const path = `discovery/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Never throws. The row is the part the app reads, so a file that fails to
// delete is logged and left, not surfaced.
export async function removeDiscoveryPhotoFile(publicUrl: string): Promise<void> {
  const path = storagePathFromPublicUrl(publicUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("Failed to remove discovery photo from storage:", error.message);
}

// The form holds a url that is not the entry's saved one: it was uploaded in
// this edit and never saved, so the file can go. The saved url is left alone
// until a save replaces it.
export function discardUnsavedPhoto(current: string, saved: string | null): void {
  if (current && current !== saved) void removeDiscoveryPhotoFile(current);
}
