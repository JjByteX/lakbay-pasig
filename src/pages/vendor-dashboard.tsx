import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { fetchOwnBusiness, createBusiness } from "@/lib/vendor-business";
import type { VendorBusinessDetail, VendorBusinessPayload } from "@/lib/vendor-types";
import { Button } from "@/components/ui/button";
import {
  BusinessFields,
  EMPTY_BUSINESS_FORM,
  type BusinessFormState,
} from "@/components/business/business-fields";

/**
 * Step 9, Phase 3: create-branch form. Field-list JSX now lives in the
 * shared BusinessFields component (src/components/business/business-fields.tsx),
 * pulled out after SonarQube flagged 93 duplicated lines against
 * admin-business-detail.tsx, which had the same field set copied
 * verbatim. BUSINESS_TYPES, LANGUAGES, REGISTERED_OR_INFORMAL,
 * BusinessFormState, and EMPTY_BUSINESS_FORM all moved to that shared
 * module too, this file no longer keeps its own copies.
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

export default function VendorDashboardPage() {
  const { session, loading } = useAuth();

  const [business, setBusiness] = useState<VendorBusinessDetail | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [form, setForm] = useState<BusinessFormState>(EMPTY_BUSINESS_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  if (loading) return null;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground">Vendor</h1>
        <p className="text-base text-muted-foreground">
          Sign in to list or manage your business.
        </p>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  function updateField<K extends keyof BusinessFormState>(key: K, value: BusinessFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // business_type is required at the DB level (migration 0004, not null
  // plus a check constraint), re-confirmed before writing this gate, so it
  // belongs in canSubmit alongside name and address, not left to surface
  // as a raw Postgres constraint error on submit.
  const canSubmit =
    form.name.trim().length > 0 &&
    form.address.trim().length > 0 &&
    form.business_type.trim().length > 0 &&
    !creating;

  // 3.3: submit calls createBusiness. verification_status is never sent,
  // it defaults to 'pending' at the database level (migration 0004),
  // matching Tier 1's instant-live rule from vendor-mode-spec.md.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !session) return;

    setCreating(true);
    setCreateError(null);

    const payload: VendorBusinessPayload = {
      name: form.name,
      business_type: form.business_type,
      category: form.category || null,
      description: form.description || null,
      address: form.address,
      contact: form.contact || null,
      opening_hours: form.opening_hours || null,
      business_story: form.business_story || null,
      unique_specialty: form.unique_specialty || null,
      accessibility_info: form.accessibility_info || null,
      social_media_links: form.social_media_links
        ? form.social_media_links.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
      language: form.language || null,
      registered_or_informal: (form.registered_or_informal || null) as
        | "registered"
        | "informal"
        | null,
    };

    try {
      await createBusiness(session.user.id, payload);
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

  // Phase 4 fills in the real loaded dashboard (status, metrics, edit,
  // item management entry point) here. This is a placeholder confirming
  // the create flow worked, not this step's final state.
  if (business) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
        <h1 className="text-xl font-semibold text-foreground">{business.name}</h1>
        <p className="text-base text-muted-foreground">Dashboard coming in Phase 4.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <h1 className="text-xl font-semibold text-foreground">List your business</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <BusinessFields
          form={form}
          onChange={updateField}
          requiredMarkers
          addressPlaceholder="Source of truth for your location"
          showRegisteredOrInformal
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
