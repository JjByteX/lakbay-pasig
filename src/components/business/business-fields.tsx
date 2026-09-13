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
 * Extracted from admin-business-detail.tsx and vendor-dashboard.tsx (Step 9,
 * Phase 3), which had copied the same field-list JSX wholesale into two
 * files, flagged by SonarQube as 93 duplicated lines and by
 * constraints.md's own "WHAT MUST NEVER HAPPEN" list, item one: do not
 * create duplicate functions, features, or components. Same fix shape as
 * the existing auth-layout.tsx precedent (architecture-notes.md's Auth
 * visual pass entry): one shared component, callers keep their own state,
 * submit handler, and surrounding page chrome.
 *
 * BUSINESS_TYPES, LANGUAGES, REGISTERED_OR_INFORMAL, and BusinessFormState
 * move here as the single source. Both pages now import from here instead
 * of each keeping a page-local copy.
 */

export const BUSINESS_TYPES = ["Product", "Service", "Both"] as const;
export const LANGUAGES = ["English", "Filipino", "Both"] as const;
export const REGISTERED_OR_INFORMAL = ["registered", "informal"] as const;

/**
 * registered_or_informal is optional: admin-business-detail.tsx's form
 * never sets or sends it, staff doesn't self-declare this field (Phase
 * 0.4's finding, data-model.md and vendor-mode-spec.md both name it as
 * vendor-self-declared only). vendor-dashboard.tsx always provides it.
 * showRegisteredOrInformal below controls whether the field renders at
 * all, so admin's form doesn't gain a field it has no state slot for.
 */
export interface BusinessFormState {
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
  registered_or_informal?: string;
}

export const EMPTY_BUSINESS_FORM: BusinessFormState = {
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

// admin-form-fields-plan.md #2: every maxLength needs a visible counter
// nearby so the cap isn't a silent wall. Moved here from
// admin-business-detail.tsx and vendor-dashboard.tsx's own page-local
// copies, since it now serves only this shared field block, not kept
// page-local per the CharCount precedent that applied when each page
// still owned its own separate field JSX.
export function CharCount({ value, max }: Readonly<{ value: string; max: number }>) {
  return (
    <span className="self-end text-xs text-muted-foreground">
      {value.length}/{max}
    </span>
  );
}

interface BusinessFieldsProps {
  form: BusinessFormState;
  onChange: <K extends keyof BusinessFormState>(key: K, value: BusinessFormState[K]) => void;
  /**
   * Admin's field labels carry no asterisk and its Address placeholder
   * names map coordinates explicitly, since staff already know a value is
   * required by the surrounding Save Changes flow. Vendor's create form
   * shows both, a first-time vendor has no equivalent context yet. Real
   * copy differences, not accidental drift, kept as a prop rather than
   * picking one wording for both callers.
   */
  requiredMarkers?: boolean;
  addressPlaceholder?: string;
  /** Admin's Name/Business Type sit in one two-column row; vendor's create
   *  form stacks them full width. Both are real, existing layouts, kept as
   *  a prop rather than forcing one caller to change its layout to match
   *  the other. */
  nameAndTypeInRow?: boolean;
  /** Off for admin, on for vendor. See BusinessFormState's own comment
   *  above on why this field is optional. */
  showRegisteredOrInformal?: boolean;
}

export function BusinessFields({
  form,
  onChange,
  requiredMarkers = false,
  addressPlaceholder = "Source of truth, map coordinates are generated from this",
  nameAndTypeInRow = false,
  showRegisteredOrInformal = false,
}: Readonly<BusinessFieldsProps>) {
  const nameField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor="name">Business Name{requiredMarkers ? " *" : ""}</Label>
      <Input
        id="name"
        value={form.name}
        onChange={(e) => onChange("name", e.target.value)}
        required
        maxLength={150}
      />
      <CharCount value={form.name} max={150} />
    </div>
  );

  const typeField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor="business_type">Business Type{requiredMarkers ? " *" : ""}</Label>
      <Select value={form.business_type} onValueChange={(v) => onChange("business_type", v)}>
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
  );

  return (
    <>
      {nameAndTypeInRow ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {nameField}
          {typeField}
        </div>
      ) : (
        <>
          {nameField}
          {typeField}
        </>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="category">Category</Label>
        <Input
          id="category"
          value={form.category}
          onChange={(e) => onChange("category", e.target.value)}
          maxLength={100}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="One line, what the business sells or offers"
          value={form.description}
          onChange={(e) => onChange("description", e.target.value)}
          maxLength={300}
        />
        <CharCount value={form.description} max={300} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="address">Address{requiredMarkers ? " *" : ""}</Label>
        <Input
          id="address"
          placeholder={addressPlaceholder}
          value={form.address}
          onChange={(e) => onChange("address", e.target.value)}
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
            onChange={(e) => onChange("contact", e.target.value)}
            maxLength={150}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="opening_hours">Opening Hours</Label>
          <Input
            id="opening_hours"
            value={form.opening_hours}
            onChange={(e) => onChange("opening_hours", e.target.value)}
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
          onChange={(e) => onChange("business_story", e.target.value)}
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
          onChange={(e) => onChange("unique_specialty", e.target.value)}
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
          onChange={(e) => onChange("accessibility_info", e.target.value)}
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
            onChange={(e) => onChange("social_media_links", e.target.value)}
            maxLength={500}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="language">Language</Label>
          <Select value={form.language} onValueChange={(v) => onChange("language", v)}>
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

      {showRegisteredOrInformal && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="registered_or_informal">Registered or Informal</Label>
          <Select
            value={form.registered_or_informal ?? ""}
            onValueChange={(v) => onChange("registered_or_informal", v)}
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
      )}
    </>
  );
}
