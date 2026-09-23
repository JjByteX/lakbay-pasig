import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Pencil, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { getVendorBusiness, type VendorBusiness } from "@/lib/vendor-status";
import {
  fetchItems,
  createItem,
  updateItem,
  deleteItem,
  uploadItemPhoto,
  removeItemPhoto,
  removeAllItemPhotoFiles,
  validateItemPhotoFile,
} from "@/lib/vendor-items";
import type { ItemPhoto, VendorItem } from "@/lib/vendor-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/business/business-fields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePageTitle } from "@/lib/page-title";

/**
 * Step 9, Phase 5: item management page, mounted at /vendor/items.
 * Guest-locked branch below is unchanged from Phase 2.1's stub, this
 * file's own earlier header comment already explains that reasoning in
 * full (same shape vendor-dashboard.tsx uses).
 *
 * 5.1: loads the caller's business via getVendorBusiness (the narrow
 * read vendor-status.ts already exports -- id and name only, enough to
 * scope the item queries below and label the page, not the fuller
 * VendorBusinessDetail vendor-dashboard.tsx needs for its own edit form).
 * No business yet: redirect to /vendor via <Navigate>, matching
 * protected-route.tsx's own render-time redirect idiom rather than an
 * imperative navigate() call inside an effect.
 *
 * 5.2-5.4: list, add, edit, delete, all against business_items through
 * vendor-items.ts's existing CRUD (fetchItems, createItem, updateItem,
 * deleteItem), all four already built in Phase 1.3, none new here.
 * business_items_write_own (migration 0004) checks the parent business's
 * submitted_by, so a write here can never touch another vendor's items,
 * the RLS policy would reject it regardless of what this page sends.
 */

// Shared with saved.tsx, trails.tsx, profile.tsx, and vendor-dashboard.tsx's
// own page-local copies, same PostgrestError shape check. Kept page-local,
// matching this codebase's existing convention (no shared helper exists
// for this), per constraints.md's Inventory Before Suggesting rule.
function errorMessageFrom(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string"
    ? err.message
    : fallback;
}

// 5.3: exact wording from vendor-mode-spec.md's Warning, Not a Block
// section -- tied to the actual consequence, not a generic required-field
// message. Shown at the point of entry (inline under the price input),
// and also whenever an existing item's price is blank in the list below,
// same copy both places per ux-ui-guidelines.md's Label Rules (one label
// per concept, used consistently).
const NO_PRICE_WARNING =
  "Without a price, this item will not show up when someone filters by price range.";

function formatPrice(price: number | null): string {
  if (price === null) return "No price set";
  return price.toLocaleString(undefined, { style: "currency", currency: "PHP" });
}

// 5.2: one row's add/edit form fields, shared between the "add item" form
// and a row's own inline edit state, so the two don't drift into two
// slightly different field sets for the same concept.
//
// Phase 7.5: the Price field's tooltip (FieldLabel below) reuses
// NO_PRICE_WARNING verbatim rather than a generic "why we ask" line, per
// the spec's own price-field special case -- same copy already shown
// inline under this field and per-row in the list below, now also in the
// tooltip, all three reading identically per ux-ui-guidelines.md's Label
// Rules (one label per concept, same wording everywhere it appears).
function ItemFormFields({
  name,
  price,
  onNameChange,
  onPriceChange,
}: Readonly<{
  name: string;
  price: string;
  onNameChange: (value: string) => void;
  onPriceChange: (value: string) => void;
}>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <FieldLabel
          htmlFor="item-name"
          help="Shown as this item's title on your listing."
          requiredMarker
        >
          Name
        </FieldLabel>
        <Input
          id="item-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          required
          maxLength={150}
        />
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="item-price" help={NO_PRICE_WARNING}>
          Price (₱)
        </FieldLabel>
        <Input
          id="item-price"
          type="number"
          inputMode="numeric"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          placeholder="Optional"
          className="w-24"
        />
        {/* 5.3: shown as soon as the field is blank, not only after a
            failed submit attempt -- "at the point of entry" per the spec. */}
        {price.trim().length === 0 && (
          <p className="text-sm text-muted-foreground">{NO_PRICE_WARNING}</p>
        )}
      </div>
    </div>
  );
}

// Item photos plan: photo management for one existing item, shown inside
// a row's own edit state only. An item needs an id before a photo can
// upload against it (business_item_photos.item_id is not null), so this
// never renders in the "Add an item" form -- add-then-edit is the path to
// give a brand new item its first photo, same as the rest of this page's
// add/edit split.
//
// Thumbnails plus one add control, same file-input-as-label pattern
// avatar-upload.tsx already uses, sized down to a 16 (h-16 w-16) square
// row rather than avatar-upload.tsx's own circular AVATAR_SIZE.lg, since
// several photos sit side by side here instead of one picture next to a
// name.
function ItemPhotos({
  businessId,
  itemId,
  photos,
  onChange,
}: Readonly<{
  businessId: string;
  itemId: string;
  photos: ItemPhoto[];
  onChange: (photos: ItemPhoto[]) => void;
}>) {
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = `item-photo-upload-${itemId}`;

  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validateItemPhotoFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const photo = await uploadItemPhoto(businessId, itemId, file, photos.length);
      onChange([...photos, photo]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(photo: ItemPhoto) {
    setRemovingId(photo.id);
    setError(null);
    try {
      await removeItemPhoto(photo);
      onChange(photos.filter((p) => p.id !== photo.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this photo.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={inputId} help="Optional. Shown on this item's listing.">
        Photos
      </FieldLabel>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="group relative h-16 w-16">
            <img
              src={photo.photo_url}
              alt=""
              className="h-16 w-16 rounded-md border border-border object-cover"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -right-2 -top-2 h-5 w-5 rounded-full"
              onClick={() => handleRemove(photo)}
              disabled={removingId === photo.id}
              aria-label="Remove photo"
            >
              {removingId === photo.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </Button>
          </div>
        ))}
        <label
          htmlFor={inputId}
          className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input text-muted-foreground hover:bg-muted"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Pencil className="h-4 w-4" />
          )}
          <span className="text-[10px]">Add</span>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleSelect}
            disabled={uploading}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, or GIF. Up to 5MB.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function VendorItemsPage() {
  const { session, loading } = useAuth();
  const { openAuth } = useAuthModal();

  const [business, setBusiness] = useState<VendorBusiness | null>(null);
  const [businessChecked, setBusinessChecked] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [items, setItems] = useState<VendorItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // 5.3: add-item form state.
  const [addName, setAddName] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // 5.4: one row edits at a time, keyed by item id. editName/editPrice
  // hold that row's own draft, separate from the add form above so
  // opening edit on one row never clobbers an in-progress add.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // 5.4: delete confirmation. deleteTarget holds the item pending
  // confirmation, null when the dialog is closed, same shape admin-
  // business-detail.tsx's reviewAction state uses for its own dialog.
  const [deleteTarget, setDeleteTarget] = useState<VendorItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // "Items" matches every early-return branch's own h1 below (signed-out,
  // loading, error); the loaded branch's h1 shows the business's own name
  // instead, business is null in every other branch so this one expression
  // covers all of them, same reasoning discover-business-detail.tsx's
  // usePageTitle call already established for an identical shape.
  usePageTitle(business?.name ?? "Items");

  useEffect(() => {
    if (!session) return;
    setBusinessChecked(false);
    setCheckError(null);
    getVendorBusiness(session.user.id)
      .then(setBusiness)
      .catch((err: unknown) => {
        setCheckError(errorMessageFrom(err, "Could not load your business."));
      })
      .finally(() => setBusinessChecked(true));
  }, [session]);

  useEffect(() => {
    if (!business) return;
    setItemsLoading(true);
    setItemsError(null);
    fetchItems(business.id)
      .then(setItems)
      .catch((err: unknown) => {
        setItemsError(errorMessageFrom(err, "Could not load your items."));
        setItems([]);
      })
      .finally(() => setItemsLoading(false));
  }, [business]);

  if (loading) return null;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground">Items</h1>
        <p className="text-base text-muted-foreground">
          Sign in to manage your business's items.
        </p>
        <Button onClick={() => openAuth("login")}>Sign in</Button>
      </div>
    );
  }

  // 5.1: business check is still in flight, distinct from itemsLoading
  // below -- neither the redirect check nor the item list can render yet.
  if (!businessChecked) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
        <h1 className="text-xl font-semibold text-foreground">Items</h1>
        <p className="text-base text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (checkError) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
        <h1 className="text-xl font-semibold text-foreground">Items</h1>
        <p className="text-base text-destructive">{checkError}</p>
      </div>
    );
  }

  // 5.1: no business yet, redirect to /vendor, matching protected-
  // route.tsx's render-time <Navigate> idiom rather than an imperative
  // navigate() call in an effect.
  if (!business) {
    return <Navigate to="/vendor" replace />;
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!business || addName.trim().length === 0 || adding) return;

    setAdding(true);
    setAddError(null);

    const trimmedPrice = addPrice.trim();
    const parsedPrice = trimmedPrice.length > 0 ? Number(trimmedPrice) : null;

    try {
      const created = await createItem(business.id, addName.trim(), parsedPrice);
      setItems((prev) => [...prev, created]);
      setAddName("");
      setAddPrice("");
    } catch (err: unknown) {
      setAddError(errorMessageFrom(err, "Could not add this item."));
    } finally {
      setAdding(false);
    }
  }

  function openEdit(item: VendorItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditPrice(item.price === null ? "" : String(item.price));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(e: FormEvent, item: VendorItem) {
    e.preventDefault();
    if (editName.trim().length === 0 || savingEdit) return;

    setSavingEdit(true);
    setEditError(null);

    const trimmedPrice = editPrice.trim();
    const parsedPrice = trimmedPrice.length > 0 ? Number(trimmedPrice) : null;

    try {
      await updateItem(item.id, editName.trim(), parsedPrice);
      setItems((prev) =>
        prev.map((existing) =>
          existing.id === item.id
            ? { ...existing, name: editName.trim(), price: parsedPrice }
            : existing
        )
      );
      setEditingId(null);
    } catch (err: unknown) {
      setEditError(errorMessageFrom(err, "Could not save this item."));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      // Item photos plan: business_item_photos rows cascade at the DB
      // level (migration 0040) once the item itself is deleted, but the
      // underlying storage files don't. removeAllItemPhotoFiles only
      // touches storage, never the rows, so it can't race deleteItem's
      // own cascade -- same reasoning vendor-items.ts documents for why
      // this is a separate function from removeItemPhoto.
      await removeAllItemPhotoFiles(deleteTarget.photos);
      await deleteItem(deleteTarget.id);
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: unknown) {
      setDeleteError(errorMessageFrom(err, "Could not delete this item."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <h1 className="min-w-0 max-w-full break-words text-xl font-semibold text-foreground">
        {business.name}
      </h1>

      {/* 5.5: loading, error, empty, loaded, in that order, same
          convention every other list in this codebase uses. */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Items</h2>

        {itemsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!itemsLoading && itemsError && (
          <p className="text-sm text-destructive">{itemsError}</p>
        )}

        {!itemsLoading && !itemsError && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No items yet.</p>
        )}

        {!itemsLoading && !itemsError && items.length > 0 && (
          <div
            className={
              items.length === 1 && editingId === null
                ? "flex"
                : "grid grid-cols-2 gap-3"
            }
          >
            {items.map((item) => {
              if (editingId === item.id) {
                return (
                  <div
                    key={item.id}
                    className="col-span-2 flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
                  >
                    <form
                      onSubmit={(e) => handleSaveEdit(e, item)}
                      className="flex flex-col gap-3"
                    >
                      <ItemFormFields
                        name={editName}
                        price={editPrice}
                        onNameChange={setEditName}
                        onPriceChange={setEditPrice}
                      />

                      <ItemPhotos
                        businessId={business.id}
                        itemId={item.id}
                        photos={item.photos}
                        onChange={(photos) =>
                          setItems((prev) =>
                            prev.map((existing) =>
                              existing.id === item.id ? { ...existing, photos } : existing
                            )
                          )
                        }
                      />

                      {editError && <p className="text-sm text-destructive">{editError}</p>}

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={editName.trim().length === 0 || savingEdit}
                        >
                          {savingEdit ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </form>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className={
                    items.length === 1 && editingId === null
                      ? "flex w-1/2 flex-col gap-2 rounded-lg border border-border bg-card p-3"
                      : "flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                  }
                >
                  {/* Menu card plan: photo on top, name and price below,
                      same menu-picker shape as discover-business-detail.tsx.
                      Empty-photo state is a plain muted square, no
                      invented icon. */}
                  {item.photos.length > 0 ? (
                    <img
                      src={item.photos[0].photo_url}
                      alt=""
                      className="aspect-square w-full rounded-md border border-border object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full rounded-md border border-border bg-muted" />
                  )}
                  <span className="line-clamp-2 text-sm font-medium text-foreground">
                    {item.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatPrice(item.price)}
                  </span>
                  {/* 5.3: dashboard-style visible gap, not just a one-time
                      entry warning -- same copy, shown per card here so the
                      gap stays visible for an item added earlier too. */}
                  {item.price === null && (
                    <p className="text-xs text-muted-foreground">{NO_PRICE_WARNING}</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDeleteTarget(item);
                        setDeleteError(null);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5.3: add item form, name required, price optional, always
          visible beneath the list rather than behind a toggle -- fewer
          than 5 items is the common case per ux-ui-guidelines.md's
          Component Sizing Rules, so this doesn't need to be hidden away
          to keep the page uncluttered. Wrapped in the same `rounded-lg
          border border-border bg-card p-4` card shape settings.tsx (8.10)
          and BusinessFields already use, at this call site rather than
          inside ItemFormFields itself -- the row-edit form above also
          renders ItemFormFields, already sitting inside the item list's
          own bg-card <li>, so carding ItemFormFields directly would
          double the card there. */}
      <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-foreground">Add an item</h2>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <ItemFormFields
            name={addName}
            price={addPrice}
            onNameChange={setAddName}
            onPriceChange={setAddPrice}
          />

          {addError && <p className="text-sm text-destructive">{addError}</p>}
        </div>

        <p className="text-xs text-muted-foreground">* Required</p>

        <Button type="submit" disabled={addName.trim().length === 0 || adding}>
          {adding ? "Adding…" : "Add item"}
        </Button>
      </form>

      {/* 5.4: delete confirmation, same Dialog composition admin-business-
          detail.tsx's verify/reject dialog already uses -- a focused
          decision that fits a single viewport, per ux-ui-guidelines.md's
          modal-vs-panel rule. */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `"${deleteTarget.name}" will be removed from your listing. This can't be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
