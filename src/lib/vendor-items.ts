import { supabase } from "./supabase";
import type { ItemPhoto, VendorItem } from "./vendor-types";

/**
 * Step 9, Phase 1.3: business_items CRUD for the owning vendor.
 * business_items_write_own (migration 0004) checks the parent business's
 * submitted_by, re-confirmed in Phase 0.1, so these calls need no
 * businessId cross-check beyond what the RLS policy already enforces on
 * write; a vendor cannot write an item onto a business they don't own,
 * the insert/update/delete would simply fail under RLS.
 *
 * Price stays optional throughout, per vendor-mode-spec.md's Price Is
 * Optional, Not Required section: no function here requires a price, and
 * business_items.price has no not-null constraint at the DB layer either.
 *
 * Item photos plan: photos joined in on the same select as the item's own
 * name/price, business_item_photos_select_own (migration 0040) follows
 * business_items' own submitted_by check, so no separate fetch is needed.
 */

const ITEM_SELECT = "id, name, price, photos:business_item_photos(id, photo_url)";

export async function fetchItems(businessId: string): Promise<VendorItem[]> {
  const { data, error } = await supabase
    .from("business_items")
    .select(ITEM_SELECT)
    .eq("business_id", businessId)
    .order("sort_order", { referencedTable: "business_item_photos" });

  if (error) throw error;
  return (data ?? []) as VendorItem[];
}

export async function createItem(
  businessId: string,
  name: string,
  price: number | null
): Promise<VendorItem> {
  const { data, error } = await supabase
    .from("business_items")
    .insert({ business_id: businessId, name, price })
    .select(ITEM_SELECT)
    .single();

  if (error) throw error;
  return data as VendorItem;
}

export async function updateItem(id: string, name: string, price: number | null): Promise<void> {
  const { error } = await supabase.from("business_items").update({ name, price }).eq("id", id);
  if (error) throw error;
}

export async function deleteItem(id: string): Promise<void> {
  // business_item_photos cascades at the DB level (on delete cascade,
  // migration 0040), so the rows themselves need no explicit cleanup
  // here. The underlying storage files are not touched by that cascade;
  // callers that already have the item's photo list should remove each
  // file first (see removeItemPhotoFile), same order admin-place-
  // detail.tsx's handleRemovePhoto uses for a place photo.
  const { error } = await supabase.from("business_items").delete().eq("id", id);
  if (error) throw error;
}

// Item photos plan: bucket and path shape match admin-place-detail.tsx's
// own PHOTO_BUCKET convention exactly (same "content-photos" bucket every
// place/business photo already uses), not a new bucket. Path keeps the
// business id in it (businesses/<business_id>/items/...) so the existing
// content_photos_write_own_business storage policy, which only checks
// that the business id appears somewhere in the object path, already
// covers this write with no new storage policy.
const PHOTO_BUCKET = "content-photos";
export const ITEM_PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5MB, same cap as avatar-storage.ts
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function validateItemPhotoFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return "Please choose a JPG, PNG, WEBP, or GIF image.";
  }
  if (file.size > ITEM_PHOTO_MAX_BYTES) {
    return "That image is larger than 5MB. Please choose a smaller file.";
  }
  return null;
}

/**
 * Uploads a validated file to content-photos and inserts the matching
 * business_item_photos row. sortOrder is the caller's current photo
 * count for this item, same append-at-the-end convention admin-place-
 * detail.tsx's handlePhotoSelected uses for place_photos.
 */
export async function uploadItemPhoto(
  businessId: string,
  itemId: string,
  file: File,
  sortOrder: number
): Promise<ItemPhoto> {
  const path = `businesses/${businessId}/items/${itemId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);

  const { data: inserted, error: insertError } = await supabase
    .from("business_item_photos")
    .insert({ item_id: itemId, photo_url: publicUrlData.publicUrl, sort_order: sortOrder })
    .select("id, photo_url")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not save the uploaded photo.");
  }
  return inserted as ItemPhoto;
}

/**
 * Removes the underlying storage object for a photo's public URL only,
 * no business_item_photos row delete. Split out from removeItemPhoto so
 * deleteItem's own cascade (business_item_photos references business_items
 * on delete cascade, migration 0040) isn't raced by a second, separate row
 * delete for a row about to disappear anyway -- same reasoning avatar-
 * storage.ts's removeAvatarFile documents for its own file-only cleanup.
 * Best-effort: a failure here is logged, not thrown.
 */
async function removeItemPhotoFile(photoUrl: string): Promise<void> {
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const index = photoUrl.indexOf(marker);
  if (index === -1) return;
  const storagePath = decodeURIComponent(photoUrl.slice(index + marker.length));

  const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
  if (storageError) {
    console.error("Failed to remove item photo from storage:", storageError.message);
  }
}

/**
 * Deletes the row and best-effort removes the underlying file, same order
 * and same best-effort-on-storage-failure shape as admin-place-detail.tsx's
 * handleRemovePhoto: the row (what the rest of the app reads) is the
 * source of truth, a storage failure never blocks the UI from reflecting
 * the photo as gone. Use this for an explicit single-photo remove (the
 * "x" on one thumbnail); use removeItemPhotoFile alone when the row is
 * already being deleted some other way (e.g. the whole item going away).
 */
export async function removeItemPhoto(photo: ItemPhoto): Promise<void> {
  const { error: deleteError } = await supabase
    .from("business_item_photos")
    .delete()
    .eq("id", photo.id);
  if (deleteError) throw new Error(deleteError.message);

  await removeItemPhotoFile(photo.photo_url);
}

/**
 * Best-effort storage cleanup for every photo on an item about to be
 * deleted. Called by the item-delete flow before deleteItem, which cascades
 * the business_item_photos rows itself -- this only ever needs to reach
 * the storage objects, never the rows.
 */
export async function removeAllItemPhotoFiles(photos: ItemPhoto[]): Promise<void> {
  await Promise.all(photos.map((photo) => removeItemPhotoFile(photo.photo_url)));
}

/**
 * Step 9, Phase 1.5: pure function, no Supabase call, per vendor-mode-
 * spec.md's dashboard requirement, "a visible count, like items missing a
 * price, so the gap stays visible over time, not just a one time
 * dismissible warning." Kept in this file rather than vendor-dashboard.ts
 * since it operates on the same VendorItem list fetchItems already
 * returns, not a second query.
 */
export function missingPriceCount(items: VendorItem[]): number {
  return items.filter((item) => item.price === null).length;
}
