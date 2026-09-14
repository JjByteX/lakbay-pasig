// Step 9, Phase 1.1: types for the vendor write path. vendor-status.ts's
// existing VendorBusiness stays as is, it is the narrow shape profile.tsx's
// entry-point check needs (id, name, verification_status only). These types
// cover the fuller self-read and self-write shapes vendor-dashboard.tsx and
// vendor-items.tsx need, checked against 0004_businesses.sql's actual
// column list, not re-derived from memory.

/**
 * Full self-read shape of a vendor's own businesses row. Every field a
 * vendor can see or edit on their own listing, per businesses_select_own
 * (migration 0004, `using (auth.uid() = submitted_by)`), which returns the
 * row unnarrowed, unlike businesses_select_public. Excludes reviewed_by
 * (an internal staff reference id, no display use on this page) and
 * updated_at (not shown anywhere in vendor-mode-spec.md's dashboard field
 * list). views_count and saves_count are included per that same field
 * list ("views and saves count"), rendered as a secondary line only, per
 * the doc's "Not generic view and save counts" instruction for the
 * headline metric.
 */
export interface VendorBusinessDetail {
  id: string;
  name: string;
  business_type: string;
  category_id: string | null;
  description: string | null;
  address: string;
  contact: string | null;
  opening_hours: string | null;
  business_story: string | null;
  unique_specialty: string | null;
  accessibility_info: string | null;
  social_media_links: string[] | null;
  language: string | null;
  verification_status: "pending" | "verified" | "unverified";
  review_notes: string | null;
  featured_status: "listed" | "featured";
  registered_or_informal: "registered" | "informal" | null;
  views_count: number;
  saves_count: number;
}

/**
 * Payload for create and update. Deliberately excludes verification_status,
 * featured_status, reviewed_by, review_notes, views_count, saves_count,
 * submitted_by, per architecture-notes.md's Known Fragile Areas note: RLS
 * update policies guard the row, not the column, so the app layer is what
 * must keep a vendor's own write from ever touching a staff-only field.
 * latitude/longitude are left out for the same reason they're absent from
 * this form: data-model.md states they are auto-generated from address,
 * and no geocoding step exists yet anywhere in this codebase (grepped,
 * confirmed in Phase 0.3), so this phase cannot honestly collect them.
 */
export interface VendorBusinessPayload {
  name: string;
  business_type: string;
  category_id: string | null;
  description: string | null;
  address: string;
  contact: string | null;
  opening_hours: string | null;
  business_story: string | null;
  unique_specialty: string | null;
  accessibility_info: string | null;
  social_media_links: string[] | null;
  language: string | null;
  registered_or_informal: "registered" | "informal" | null;
}

/** business_items row, name and price only, matching migration 0004's columns. */
export interface VendorItem {
  id: string;
  name: string;
  price: number | null;
}

/**
 * One published route this business appears in, for the dashboard's trail
 * inclusion metric. theme included since vendor-mode-spec.md's own example
 * phrasing ("3 active food crawls") names the theme, not just a bare count.
 */
export interface TrailInclusion {
  id: string;
  name: string;
  theme: string | null;
}
