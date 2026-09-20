import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BusinessCategory } from "@/lib/business-categories";
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
 * BUSINESS_TYPES, REGISTERED_OR_INFORMAL, and BusinessFormState move here
 * as the single source. Both pages now import from here instead of each
 * keeping a page-local copy.
 *
 * Category Directory Expansion, Phase 4.1: Category field changes from a
 * free text Input to a Select pulling from business_categories (migration
 * 0027), same Select pattern this file's own Business Type field already
 * uses. BusinessFormState.category (string) becomes
 * category_id (string), matching place/trail/event category's own
 * category_id shape -- a business category is now a real fixed list, not
 * free text, for the first time. The picker's own active-row list is
 * fetched by each caller (admin-business-detail.tsx, vendor-dashboard.tsx),
 * same shape as admin-place-detail.tsx's own categories fetch, and passed
 * in as a prop here rather than fetched inside this shared field block, so
 * neither caller pays for a second independent fetch of the same list.
 *
 * BusinessFields returns one `rounded-lg border border-border bg-card p-4`
 * card wrapping every field, same card shape settings.tsx already uses
 * (8.10) -- both call sites (admin-business-detail.tsx, vendor-
 * dashboard.tsx x2) render this as their entire form body, with only the
 * error text, required-fields note, and Cancel/Save buttons left outside
 * the card, so wrapping once here covers every caller instead of each
 * page repeating the same card div around its own BusinessFields call.
 */

export const BUSINESS_TYPES = ["Product", "Service", "Both"] as const;
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
  category_id: string;
  description: string;
  address: string;
  contact: string;
  opening_hours: string;
  business_story: string;
  unique_specialty: string;
  accessibility_info: string;
  social_media_links: string;
  registered_or_informal?: string;
}

export const EMPTY_BUSINESS_FORM: BusinessFormState = {
  name: "",
  business_type: "",
  category_id: "",
  description: "",
  address: "",
  contact: "",
  opening_hours: "",
  business_story: "",
  unique_specialty: "",
  accessibility_info: "",
  social_media_links: "",
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

/**
 * Phase 7.2: one short reason per field, same direct tone as the rest of
 * the app's labels, not a paragraph. Phase 7.5's price-field special case
 * lives in vendor-items.tsx instead, since business-fields.tsx has no
 * price field -- see this file's own git history / architecture-notes.md's
 * Phase 7 entry for why the phase's own filename doesn't cover both spots.
 */
const FIELD_HELP: Record<
  | "name"
  | "business_type"
  | "category"
  | "description"
  | "address"
  | "contact"
  | "opening_hours"
  | "business_story"
  | "unique_specialty"
  | "accessibility_info"
  | "social_media_links"
  | "registered_or_informal",
  string
> = {
  name: "Shown as the listing's title everywhere it appears.",
  business_type: "Lets visitors filter by product, service, or both.",
  category: "Groups the listing under Discover's category filters.",
  description: "One line, shown on the listing card before someone taps in.",
  address: "Source of truth for the map pin, generated from this.",
  contact: "How a visitor reaches the business directly.",
  opening_hours: "Shown so visitors know when to expect the business open.",
  business_story: "The longer background, shown on the full listing page.",
  unique_specialty: "What makes this business worth a special trip.",
  accessibility_info: "Helps visitors with access needs plan ahead.",
  social_media_links: "Shown as links on the listing for visitors to follow.",
  registered_or_informal: "Doesn't affect approval, shown for CATO's records only.",
};

/**
 * Phase 7.1/7.3/7.4: reuses tooltip.tsx directly rather than a new
 * component. Neither business-fields.tsx nor vendor-items.tsx sits
 * beneath sidebar.tsx's app-scoped TooltipProvider (that one only wraps
 * SidebarProvider's children), so this wraps its own trigger+content pair
 * locally instead of assuming a provider higher up the tree. Exported so
 * vendor-items.tsx's ItemFormFields (Phase 7.5, the Item price field) can
 * reuse the same label+icon+tooltip shape rather than a second copy of
 * this same logic, per constraints.md's Inventory Before Suggesting rule.
 *
 * 7.4: Radix's Tooltip.Root already opens on hover and on keyboard focus
 * uncontrolled -- desktop and a11y are covered for free. Radix has no
 * built-in tap-to-open on touch (no hover event fires on tap), so `open`
 * is also controlled here and toggled by the icon's own onClick. A click
 * has no other meaning on this icon, so the toggle is harmless on a
 * hover-capable desktop and is what makes tap work on a touch device --
 * no device/viewport detection needed (use-mobile.tsx's useIsMobile is a
 * viewport-width check, not a touch-capability one, and would misfire on
 * a narrow desktop window or a wide touch tablet).
 *
 * 7.6: no avoidCollisions override, so Radix's own default collision
 * avoidance keeps the content from clipping at a narrow viewport. The
 * icon sits beside the Label, never on the Input/Textarea/Select itself,
 * so a tap on the icon never triggers the field's own tap-to-focus and a
 * tap on the field never opens the tooltip.
 *
 * 7.7: TooltipContent already uses text-xs, rounded-md, and the popover
 * tokens (tooltip.tsx) -- no new token introduced. gap-2 (8px) matches
 * the icon+label pairing already established for facility chips
 * (architecture-notes.md's Category Directory Expansion Phase 5 fix).
 */
export function FieldLabel({
  htmlFor,
  children,
  help,
  requiredMarker = false,
}: Readonly<{
  htmlFor: string;
  children: ReactNode;
  help: string;
  requiredMarker?: boolean;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={htmlFor}>
        {children}
        {requiredMarker ? " *" : ""}
      </Label>
      <TooltipProvider delayDuration={200}>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="shrink-0 text-muted-foreground"
              aria-label={`Why we ask for ${typeof children === "string" ? children : "this field"}`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
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
  /**
   * Category Directory Expansion, Phase 4.1: active business_categories
   * rows for the Category Select, fetched by the caller (same shape
   * admin-place-detail.tsx's own categories/categoriesError props for its
   * Place Category field) rather than fetched inside this shared block, so
   * neither admin nor vendor pays for a second independent fetch.
   */
  categories: BusinessCategory[];
  categoriesError?: string | null;
}

export function BusinessFields({
  form,
  onChange,
  requiredMarkers = false,
  addressPlaceholder = "Source of truth, map coordinates are generated from this",
  nameAndTypeInRow = false,
  showRegisteredOrInformal = false,
  categories,
  categoriesError = null,
}: Readonly<BusinessFieldsProps>) {
  const nameField = (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor="name" help={FIELD_HELP.name} requiredMarker={requiredMarkers}>
        Business Name
      </FieldLabel>
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
      <FieldLabel
        htmlFor="business_type"
        help={FIELD_HELP.business_type}
        requiredMarker={requiredMarkers}
      >
        Business Type
      </FieldLabel>
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
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
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
        <FieldLabel htmlFor="category" help={FIELD_HELP.category}>
          Category
        </FieldLabel>
        <Select value={form.category_id} onValueChange={(v) => onChange("category_id", v)}>
          <SelectTrigger id="category">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categoriesError && <p className="text-sm text-destructive">{categoriesError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="description" help={FIELD_HELP.description}>
          Description
        </FieldLabel>
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
        <FieldLabel htmlFor="address" help={FIELD_HELP.address} requiredMarker={requiredMarkers}>
          Address
        </FieldLabel>
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
          <FieldLabel htmlFor="contact" help={FIELD_HELP.contact}>
            Contact
          </FieldLabel>
          <Input
            id="contact"
            value={form.contact}
            onChange={(e) => onChange("contact", e.target.value)}
            maxLength={150}
          />
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="opening_hours" help={FIELD_HELP.opening_hours}>
            Opening Hours
          </FieldLabel>
          <Input
            id="opening_hours"
            value={form.opening_hours}
            onChange={(e) => onChange("opening_hours", e.target.value)}
            maxLength={150}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="business_story" help={FIELD_HELP.business_story}>
          Business Story
        </FieldLabel>
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
        <FieldLabel htmlFor="unique_specialty" help={FIELD_HELP.unique_specialty}>
          Unique Specialty
        </FieldLabel>
        <Textarea
          id="unique_specialty"
          value={form.unique_specialty}
          onChange={(e) => onChange("unique_specialty", e.target.value)}
          maxLength={300}
        />
        <CharCount value={form.unique_specialty} max={300} />
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="accessibility_info" help={FIELD_HELP.accessibility_info}>
          Accessibility Info
        </FieldLabel>
        <Textarea
          id="accessibility_info"
          placeholder="Parking, wheelchair access, nearby transport"
          value={form.accessibility_info}
          onChange={(e) => onChange("accessibility_info", e.target.value)}
          maxLength={300}
        />
        <CharCount value={form.accessibility_info} max={300} />
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="social_media_links" help={FIELD_HELP.social_media_links}>
          Social Media Links
        </FieldLabel>
        <Input
          id="social_media_links"
          placeholder="Comma separated"
          value={form.social_media_links}
          onChange={(e) => onChange("social_media_links", e.target.value)}
          maxLength={500}
        />
      </div>

      {showRegisteredOrInformal && (
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="registered_or_informal" help={FIELD_HELP.registered_or_informal}>
            Registered or Informal
          </FieldLabel>
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
    </div>
  );
}
