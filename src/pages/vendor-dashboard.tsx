import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Store } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal";
import { fetchOwnBusiness, createBusiness, updateBusiness } from "@/lib/vendor-business";
import { fetchTrailInclusions } from "@/lib/vendor-dashboard";
import { fetchItems, missingPriceCount } from "@/lib/vendor-items";
import { fetchActiveCategories, type BusinessCategory } from "@/lib/business-categories";
import type {
  VendorBusinessDetail,
  VendorBusinessPayload,
  TrailInclusion,
  VendorItem,
} from "@/lib/vendor-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BusinessFields,
  EMPTY_BUSINESS_FORM,
  type BusinessFormState,
} from "@/components/business/business-fields";
import { usePageTitle } from "@/lib/page-title";

/**
 * Step 9, Phase 3: create-branch form. Field-list JSX now lives in the
 * shared BusinessFields component (src/components/business/business-fields.tsx),
 * pulled out after SonarQube flagged 93 duplicated lines against
 * admin-business-detail.tsx, which had the same field set copied
 * verbatim. BUSINESS_TYPES, REGISTERED_OR_INFORMAL, BusinessFormState, and
 * EMPTY_BUSINESS_FORM all moved to that shared module too, this file no
 * longer keeps its own copies.
 *
 * Step 9, Phase 4: loaded-branch dashboard. Same STATUS_VARIANT mapping
 * and accent Featured badge admin-business-detail.tsx already uses (4.1),
 * per ux-ui-guidelines.md's "same icon/style per concept everywhere"
 * rule -- this is the same Pending/Verified/Unverified concept on the
 * vendor's own side of the same row, not a new one. Review notes render
 * plainly when present, matching the rejection-reason display already on
 * the admin side. Metrics (4.2), edit entry point (4.3), and item
 * management entry point (4.4) all added below; create-branch form (Phase
 * 3) and its handleSubmit are otherwise unchanged.
 *
 * Category Directory Expansion, Phase 4.3: this file's businessToForm/
 * formToPayload already read and wrote category_id (both moved off the
 * dropped category column earlier), but neither of this file's two
 * BusinessFields call sites (create branch, edit branch) ever passed the
 * now-required categories prop, so both branches failed to satisfy
 * BusinessFieldsProps. Closes the other half of decision-log/architecture-
 * notes' flagged 1.8 gap: a categories/categoriesError fetch was added
 * below, same fetchActiveCategories-on-mount shape admin-business-
 * detail.tsx's own Phase 4.2 effect already uses, and both call sites now
 * pass it through.
 */

// Shared with saved.tsx, trails.tsx, and profile.tsx's own page-local
// copies, same PostgrestError shape check. Kept page-local, matching this
// codebase's existing convention (no shared helper exists for this),
// per constraints.md's Inventory Before Suggesting rule.
function errorMessageFrom(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string"
    ? err.message
    : fallback;
}

// 4.1: same mapping admin-business-detail.tsx's own STATUS_VARIANT uses,
// reused rather than redefined, per constraints.md's Inventory Before
// Suggesting rule -- this is the vendor's own read of the identical
// verification_status concept, not a second status vocabulary.
const STATUS_VARIANT = {
  pending: "outline",
  verified: "default",
  unverified: "destructive",
} as const;

// 4.2: registered_or_informal is self-declared, display only, per Phase
// 0.4's finding -- never a gate on Featured eligibility (vendor-mode-
// spec.md's Resolved Decisions). Plain label, no badge: this isn't a
// review-state concept like verification_status or featured_status, just
// an informational field.
const REGISTERED_OR_INFORMAL_LABEL: Record<"registered" | "informal", string> = {
  registered: "Registered (has DTI/permit)",
  informal: "Informal",
};

function businessToForm(business: VendorBusinessDetail): BusinessFormState {
  return {
    name: business.name,
    business_type: business.business_type,
    category_id: business.category_id ?? "",
    description: business.description ?? "",
    address: business.address,
    latitude: business.latitude,
    longitude: business.longitude,
    contact: business.contact ?? "",
    opening_hours: business.opening_hours ?? "",
    rules: business.rules ?? "",
    business_story: business.business_story ?? "",
    unique_specialty: business.unique_specialty ?? "",
    accessibility_info: business.accessibility_info ?? "",
    social_media_links: (business.social_media_links ?? []).join(", "),
    registered_or_informal: business.registered_or_informal ?? "",
  };
}

function formToPayload(form: BusinessFormState): VendorBusinessPayload {
  return {
    name: form.name,
    business_type: form.business_type,
    category_id: form.category_id || null,
    description: form.description || null,
    address: form.address,
    latitude: form.latitude,
    longitude: form.longitude,
    contact: form.contact || null,
    opening_hours: form.opening_hours || null,
    rules: form.rules || null,
    business_story: form.business_story || null,
    unique_specialty: form.unique_specialty || null,
    accessibility_info: form.accessibility_info || null,
    social_media_links: form.social_media_links
      ? form.social_media_links.split(",").map((s) => s.trim()).filter(Boolean)
      : null,
    registered_or_informal: (form.registered_or_informal || null) as
      | "registered"
      | "informal"
      | null,
  };
}

// SonarCloud L385/L409: nested ternary flagged inside the MetricLine JSX.
// Pulled into named functions, one branch per statement, same copy as
// before -- no ternary nesting left to read, and each has an obvious name
// at the call site instead of an inline conditional expression.
function trailInclusionText(count: number): string {
  if (count === 0) return "Not included in any published trail yet.";
  const plural = count === 1 ? "" : "s";
  return `Included in ${count} trail${plural}.`;
}

function itemsMissingPriceText(items: VendorItem[]): string {
  if (items.length === 0) return "No items listed yet.";
  const plural = items.length === 1 ? "" : "s";
  return `${missingPriceCount(items)} of ${items.length} item${plural} missing a price.`;
}

// 4.2: trail inclusion and item metrics each fetch independently (same
// per-section independence saved.tsx already established -- a slow trail
// query and a slow items query are unrelated causes), so each gets its
// own one-line loading/error/loaded render rather than one shared spinner
// for the whole metrics block.
function MetricLine({
  loading,
  error,
  children,
}: Readonly<{ loading: boolean; error: string | null; children: ReactNode }>) {
  if (loading) return <Skeleton className="h-4 w-40" />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  return <p className="text-base text-foreground">{children}</p>;
}

// SonarCloud L235: a second cognitive-complexity pass on the same
// component, same approach as the L129 note below -- branching lifted out
// of the render function rather than reshaped in place. This one computes
// the page title. usePageTitle still runs unconditionally in the page
// itself (ahead of its several early returns); only the branching moved.
// Covers every render branch: signed-out/loading/error states all show
// "Vendor" (matching their own h1), editing shows "Edit your listing", a
// loaded business shows its own name, and the not-yet-listed create form
// shows "List your business" -- same string each branch's own h1 already
// renders.
function vendorPageTitle(
  business: VendorBusinessDetail | null,
  editing: boolean,
  checking: boolean,
  checkError: string | null,
  session: Session | null,
): string {
  if (business) {
    if (editing) return "Edit your listing";
    return business.name;
  }
  if (!checking && !checkError && session) return "List your business";
  return "Vendor";
}

// SonarCloud L235: the loaded-business dashboard's own JSX, moved out of
// VendorDashboardPage whole. It reads nothing from the page beyond what's
// passed here and holds no state of its own, so this is a straight lift --
// same markup, same order, same copy. The page keeps every piece of state
// (including `editing`, which vendorPageTitle above still needs) so
// nothing moved down and back up again.
function BusinessDashboard({
  business,
  trails,
  trailsLoading,
  trailsError,
  items,
  itemsLoading,
  itemsError,
  onEdit,
}: Readonly<{
  business: VendorBusinessDetail;
  trails: TrailInclusion[];
  trailsLoading: boolean;
  trailsError: string | null;
  items: VendorItem[];
  itemsLoading: boolean;
  itemsError: string | null;
  onEdit: () => void;
}>) {
  const showTrailList = !trailsLoading && !trailsError && trails.length > 0;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 max-w-full break-words text-xl font-semibold text-foreground">
          {business.name}
        </h1>
        <Badge variant={STATUS_VARIANT[business.verification_status]}>
          {business.verification_status}
        </Badge>
        {business.featured_status === "featured" && <Badge variant="accent">Featured</Badge>}
      </div>

      {/* 4.1: review notes shown plainly when present, matching the
          rejection-reason display already on the admin side. */}
      {business.review_notes && (
        <p className="text-base text-muted-foreground">{business.review_notes}</p>
      )}

      {/* 4.2: metrics section, per vendor-mode-spec.md's Vendor Dashboard
          examples. Trail inclusion count and list first, since that's
          this app's actual differentiator, not a generic view/save
          count (the doc's explicit instruction). */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Trail Inclusion</h2>
        <MetricLine loading={trailsLoading} error={trailsError}>
          {trailInclusionText(trails.length)}
        </MetricLine>
        {showTrailList && (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {trails.map((trail) => (
              <TrailInclusionRow key={trail.id} trail={trail} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Items</h2>
        <MetricLine loading={itemsLoading} error={itemsError}>
          {itemsMissingPriceText(items)}
        </MetricLine>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Registration</h2>
        <p className="text-base text-foreground">{registrationLabel(business)}</p>
      </div>

      {/* 4.2: views/saves render as a smaller secondary line, not the
          headline metric, per vendor-mode-spec.md's explicit "Not
          generic view and save counts" instruction. */}
      <p className="text-sm text-muted-foreground">
        {business.views_count} views · {business.saves_count} saves
      </p>

      <div className="flex flex-col gap-2">
        <Button variant="outline" onClick={onEdit}>
          Edit listing
        </Button>
        {/* 4.4: item management entry point. */}
        <Button variant="outline" asChild>
          <Link to="/vendor/items">Manage items</Link>
        </Button>
      </div>
    </div>
  );
}

function TrailInclusionRow({ trail }: Readonly<{ trail: TrailInclusion }>) {
  return (
    <li className="flex items-center justify-between gap-4 p-4">
      <span className="min-w-0 max-w-full break-words text-sm text-foreground">{trail.name}</span>
      {trail.theme && <span className="shrink-0 text-sm text-muted-foreground">{trail.theme}</span>}
    </li>
  );
}

function registrationLabel(business: VendorBusinessDetail): string {
  if (!business.registered_or_informal) return "Not set";
  return REGISTERED_OR_INFORMAL_LABEL[business.registered_or_informal];
}

// SonarCloud L129: VendorDashboardPage's cognitive complexity (25, limit
// 15) came from three independent data-fetch effects each carrying their
// own branching living inside the one component function. Pulled into two
// small local hooks below, same state shape and same effect bodies, no
// behavior change -- this mirrors how save-button.tsx and the other
// signed-in-only fetch effects in this codebase are already structured as
// self-contained units, just given a name and moved out of the render
// function instead of inlined into it.

/** Loads (or after create, reloads) the caller's own business row. */
function useOwnBusiness(session: Session | null) {
  const [business, setBusiness] = useState<VendorBusinessDetail | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setChecking(true);
    setCheckError(null);
    fetchOwnBusiness(session.user.id)
      .then(setBusiness)
      .catch((err: unknown) => {
        setCheckError(errorMessageFrom(err, "Could not load your business."));
      })
      .finally(() => setChecking(false));
  }, [session]);

  return { business, setBusiness, checking, setChecking, checkError };
}

/**
 * 4.2: trail inclusion and item metrics. Both only make sense once a
 * business exists, so both effects guard on businessId, matching
 * save-button.tsx's own signed-in-only fetch guard shape. Each stays
 * independent (its own loading/error), same reasoning as this file's own
 * MetricLine comment: a slow trail query and a slow items query are
 * unrelated causes, not one shared spinner.
 */
function useVendorMetrics(businessId: string | undefined) {
  const [trails, setTrails] = useState<TrailInclusion[]>([]);
  const [trailsLoading, setTrailsLoading] = useState(true);
  const [trailsError, setTrailsError] = useState<string | null>(null);

  const [items, setItems] = useState<VendorItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    setTrailsLoading(true);
    setTrailsError(null);
    fetchTrailInclusions(businessId)
      .then(setTrails)
      .catch((err: unknown) => {
        setTrailsError(errorMessageFrom(err, "Could not load trail inclusions."));
        setTrails([]);
      })
      .finally(() => setTrailsLoading(false));
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    setItemsLoading(true);
    setItemsError(null);
    fetchItems(businessId)
      .then(setItems)
      .catch((err: unknown) => {
        setItemsError(errorMessageFrom(err, "Could not load your items."));
        setItems([]);
      })
      .finally(() => setItemsLoading(false));
  }, [businessId]);

  return { trails, trailsLoading, trailsError, items, itemsLoading, itemsError };
}

export default function VendorDashboardPage() {
  const { session, loading } = useAuth();
  const { openAuth } = useAuthModal();
  const navigate = useNavigate();

  const { business, setBusiness, checking, setChecking, checkError } = useOwnBusiness(session);
  const { trails, trailsLoading, trailsError, items, itemsLoading, itemsError } =
    useVendorMetrics(business?.id);

  const [form, setForm] = useState<BusinessFormState>(EMPTY_BUSINESS_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Category Directory Expansion, Phase 4.3: category picker source for
  // both the create form (below) and the edit form, same
  // fetchActiveCategories-on-mount shape admin-business-detail.tsx's own
  // Phase 4.2 effect already uses, independent of session/business state
  // since a first-time vendor's create form needs the picker too.
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveCategories()
      .then(setCategories)
      .catch((err: unknown) => {
        setCategoriesError(errorMessageFrom(err, "Could not load categories."));
      });
  }, []);

  // 4.3: edit entry point. Opens the same field set as the create form,
  // pre-filled from the loaded row, submit calls updateBusiness with the
  // same allow-list formToPayload already builds for create.
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<BusinessFormState>(EMPTY_BUSINESS_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // See vendorPageTitle above for which branch renders which string.
  // Computed here rather than inside each branch because usePageTitle must
  // run unconditionally, ahead of this component's several early returns.
  usePageTitle(vendorPageTitle(business, editing, checking, checkError, session));

  if (loading) return null;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground">Vendor</h1>
        <p className="text-base text-muted-foreground">
          Sign in to list or manage your business.
        </p>
        <Button onClick={() => openAuth("login")}>Sign in</Button>
      </div>
    );
  }

  function updateField<K extends keyof BusinessFormState>(key: K, value: BusinessFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateEditField<K extends keyof BusinessFormState>(
    key: K,
    value: BusinessFormState[K]
  ) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  // business_type is required at the DB level (migration 0004, not null
  // plus a check constraint), re-confirmed before writing this gate, so it
  // belongs in canSubmit alongside name and address, not left to surface
  // as a raw Postgres constraint error on submit.
  //
  // The map pin is required too (location-field-plan.md), on the edit gate
  // as well: a listing made before the pin existed has no coordinates, and
  // this is what repairs it on its next edit. BusinessFields shows "Map pin
  // required" beside the map while it is missing, so a disabled Save never
  // goes unexplained.
  const canSubmit =
    form.name.trim().length > 0 &&
    form.address.trim().length > 0 &&
    form.latitude !== null &&
    form.longitude !== null &&
    form.business_type.trim().length > 0 &&
    !creating;

  const canSaveEdit =
    editForm.name.trim().length > 0 &&
    editForm.address.trim().length > 0 &&
    editForm.latitude !== null &&
    editForm.longitude !== null &&
    editForm.business_type.trim().length > 0 &&
    !saving;

  // 3.3: submit calls createBusiness. verification_status is never sent,
  // it defaults to 'pending' at the database level (migration 0004),
  // matching Tier 1's instant-live rule from vendor-mode-spec.md.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !session) return;

    setCreating(true);
    setCreateError(null);

    try {
      await createBusiness(session.user.id, formToPayload(form));
      // 3.3: same page, no redirect, reload the just-created row so the
      // page moves from the create form to the loaded dashboard state.
      setChecking(true);
      const created = await fetchOwnBusiness(session.user.id);
      setBusiness(created);
      setChecking(false);
    } catch (err: unknown) {
      setCreateError(errorMessageFrom(err, "Could not create your listing."));
    } finally {
      setCreating(false);
    }
  }

  // 4.3: opens the edit form pre-filled from the currently loaded row, not
  // from stale create-form state.
  function openEdit() {
    if (!business) return;
    setEditForm(businessToForm(business));
    setSaveError(null);
    setEditing(true);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!canSaveEdit || !business) return;

    setSaving(true);
    setSaveError(null);

    try {
      await updateBusiness(business.id, formToPayload(editForm));
      // Same allow-list payload as create, so the local row updates to
      // exactly what was sent, no second fetch needed -- verification_status,
      // featured_status, review_notes, views_count, and saves_count are
      // untouched by this write and stay as they were on the loaded row.
      setBusiness((prev) => (prev ? { ...prev, ...formToPayload(editForm) } : prev));
      setEditing(false);
    } catch (err: unknown) {
      setSaveError(errorMessageFrom(err, "Could not save your changes."));
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
        <h1 className="text-xl font-semibold text-foreground">Vendor</h1>
        <p className="text-base text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (checkError) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
        <h1 className="text-xl font-semibold text-foreground">Vendor</h1>
        <p className="text-base text-destructive">{checkError}</p>
      </div>
    );
  }

  if (business) {
    // 4.3: editing branch. Same page, same field set as create. Per
    // ux-ui-guidelines.md's modal-vs-panel rule this is a focused task
    // that already fits a single viewport as a page-level form (same
    // shape the create branch below uses), so no dialog is introduced
    // just to hold the same fields a second way.
    if (editing) {
      return (
        <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
          <h1 className="text-xl font-semibold text-foreground">Edit your listing</h1>

          <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
            <BusinessFields
              form={editForm}
              onChange={updateEditField}
              requiredMarkers
              addressPlaceholder="Type your address and press Enter to search"
              showRegisteredOrInformal
              categories={categories}
              categoriesError={categoriesError}
            />

            {saveError && <p className="text-base text-destructive">{saveError}</p>}

            <p className="text-xs text-muted-foreground">* Required</p>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSaveEdit}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <BusinessDashboard
        business={business}
        trails={trails}
        trailsLoading={trailsLoading}
        trailsError={trailsError}
        items={items}
        itemsLoading={itemsLoading}
        itemsError={itemsError}
        onEdit={openEdit}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      {/* Back button: this screen is reached from Profile's "List your
          business" row (profile.tsx), the same navigate(-1)/ArrowLeft/
          ghost-icon pattern every other detail page (discover-place-
          detail.tsx, trail-detail.tsx, event-detail.tsx) already uses top-
          left, per ux-ui-guidelines.md's Familiarity principle -- reused,
          not a new pattern. Scoped to this create branch only: the
          has-a-business branch above is reached the same way but is the
          vendor's own home base once they have a listing, same reasoning
          vendor-items.tsx's own no-back-button choice already established
          for a page one hop from /vendor. */}
      <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <Store className="h-5 w-5 shrink-0 text-foreground" />
        <h1 className="text-xl font-semibold text-foreground">List your business</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <BusinessFields
          form={form}
          onChange={updateField}
          requiredMarkers
          addressPlaceholder="Type your address and press Enter to search"
          showRegisteredOrInformal
          categories={categories}
          categoriesError={categoriesError}
        />

        {createError && <p className="text-base text-destructive">{createError}</p>}

        <p className="text-xs text-muted-foreground">* Required</p>

        <Button type="submit" disabled={!canSubmit}>
          {creating ? "Listing…" : "List my business"}
        </Button>
      </form>
    </div>
  );
}
