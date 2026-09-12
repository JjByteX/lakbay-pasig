import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { fetchOwnBusiness, createBusiness } from "@/lib/vendor-business";
import type { VendorBusinessDetail, VendorBusinessPayload } from "@/lib/vendor-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Step 9, Phase 3: create-branch form, matching admin-business-detail.tsx's
 * field set and layout exactly (name, business type, category, description,
 * address, contact, opening hours, business story, unique specialty,
 * accessibility info, social media links, language), plus registered or
 * informal status per Phase 0.4's finding, that field is self-declared by
 * the vendor, never edited by staff, so it has no counterpart on the admin
 * form to import from.
 *
 * BUSINESS_TYPES and LANGUAGES are page-local copies, not imports:
 * admin-business-detail.tsx's own constants of the same name are page-
 * local consts, not exported from that file, so there is nothing to import
 * even though the values are identical. Flagged here rather than silently
 * redefining without a note, per constraints.md's No Silent Overrides rule.
 */
const BUSINESS_TYPES = ["Product", "Service", "Both"] as const;
const LANGUAGES = ["English", "Filipino", "Both"] as const;
const REGISTERED_OR_INFORMAL = ["registered", "informal"] as const;

interface BusinessFormState {
  name: string;
  business_type: string;
  category: string;
  description: string;
  address: string;
  contact: string;
  opening_hours: string;
  business_story: string;
  unique_specialty: string;
  accessibility_info: string;
  social_media_links: string;
  language: string;
  registered_or_informal: string;
}

const EMPTY_FORM: BusinessFormState = {
  name: "",
  business_type: "",
  category: "",
  description: "",
  address: "",
  contact: "",
  opening_hours: "",
  business_story: "",
  unique_specialty: "",
  accessibility_info: "",
  social_media_links: "",
  language: "",
  registered_or_informal: "",
};

// Shared with saved.tsx, trails.tsx, and profile.tsx's own page-local
// copies, same PostgrestError shape check. Kept page-local, matching this
// codebase's existing convention (no shared helper exists for this),
// per constraints.md's Inventory Before Suggesting rule.
function errorMessageFrom(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in err && typeof err.message === "string"
    ? err.message
    : fallback;
}

function CharCount({ value, max }: Readonly<{ value: string; max: number }>) {
  return (
    <span className="self-end text-xs text-muted-foreground">
      {value.length}/{max}
    </span>
  );
}

export default function VendorDashboardPage() {
  const { session, loading } = useAuth();

  const [business, setBusiness] = useState<VendorBusinessDetail | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);

  const [form, setForm] = useState<BusinessFormState>(EMPTY_FORM);
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Business Name *</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            required
            maxLength={150}
          />
          <CharCount value={form.name} max={150} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="business_type">Business Type *</Label>
          <Select value={form.business_type} onValueChange={(v) => updateField("business_type", v)}>
            <SelectTrigger id="business_type">
              <SelectValue placeholder="Select a type" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            value={form.category}
            onChange={(e) => updateField("category", e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="One line, what your business sells or offers"
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            maxLength={300}
          />
          <CharCount value={form.description} max={300} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="address">Address *</Label>
          <Input
            id="address"
            placeholder="Source of truth for your location"
            value={form.address}
            onChange={(e) => updateField("address", e.target.value)}
            required
            maxLength={300}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact">Contact</Label>
            <Input
              id="contact"
              value={form.contact}
              onChange={(e) => updateField("contact", e.target.value)}
              maxLength={150}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="opening_hours">Opening Hours</Label>
            <Input
              id="opening_hours"
              value={form.opening_hours}
              onChange={(e) => updateField("opening_hours", e.target.value)}
              maxLength={150}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="business_story">Business Story</Label>
          <Textarea
            id="business_story"
            placeholder="The longer background, why it exists, how it started"
            value={form.business_story}
            onChange={(e) => updateField("business_story", e.target.value)}
            className="min-h-30"
            maxLength={5000}
          />
          <CharCount value={form.business_story} max={5000} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="unique_specialty">Unique Specialty</Label>
          <Textarea
            id="unique_specialty"
            value={form.unique_specialty}
            onChange={(e) => updateField("unique_specialty", e.target.value)}
            maxLength={300}
          />
          <CharCount value={form.unique_specialty} max={300} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="accessibility_info">Accessibility Info</Label>
          <Textarea
            id="accessibility_info"
            placeholder="Parking, wheelchair access, nearby transport"
            value={form.accessibility_info}
            onChange={(e) => updateField("accessibility_info", e.target.value)}
            maxLength={300}
          />
          <CharCount value={form.accessibility_info} max={300} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="social_media_links">Social Media Links</Label>
            <Input
              id="social_media_links"
              placeholder="Comma separated"
              value={form.social_media_links}
              onChange={(e) => updateField("social_media_links", e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="language">Language</Label>
            <Select value={form.language} onValueChange={(v) => updateField("language", v)}>
              <SelectTrigger id="language">
                <SelectValue placeholder="Select a language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="registered_or_informal">Registered or Informal</Label>
          <Select
            value={form.registered_or_informal}
            onValueChange={(v) => updateField("registered_or_informal", v)}
          >
            <SelectTrigger id="registered_or_informal">
              <SelectValue placeholder="Has a DTI or permit?" />
            </SelectTrigger>
            <SelectContent>
              {REGISTERED_OR_INFORMAL.map((r) => (
                <SelectItem key={r} value={r}>
                  {r === "registered" ? "Registered (has DTI/permit)" : "Informal"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {createError && <p className="text-base text-destructive">{createError}</p>}

        <p className="text-xs text-muted-foreground">* Required</p>

        <Button type="submit" disabled={!canSubmit}>
          {creating ? "Listing…" : "List my business"}
        </Button>
      </form>
    </div>
  );
}
