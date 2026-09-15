import type { DiscoverBusiness, DiscoverPlace } from "./discover-types";

// Phase 2.1 (step-6-phases.md): Home's announcements section, sourced from
// events (migration 0006), published rows only. Full column set, not a
// summary subset like DiscoverPlace/DiscoverBusiness, since event-
// detail.tsx (Phase 4) needs the full row to render and there is no
// separate detail fetch planned, one query covers both the list and the
// detail page.
export interface Announcement {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  date_time: string | null;
  location: string | null;
  related_place_id: string | null;
}

// Phase 2.3: recently verified content reuses DiscoverPlace/DiscoverBusiness
// as-is, same row shape Discover already fetches, per constraints.md's
// Inventory Before Suggesting rule, not a second type for the same data.
// verified_at is added here rather than on the shared type, since only
// Home's sort needs it, adding it to DiscoverPlace/DiscoverBusiness would
// ripple into Discover's own query, sort, and cards for a field they never
// use.
//
// home-photo-showcase-phases.md Phase 1.1: coverPhotoUrl added the same
// way verified_at was, an intersected field on this type only, not on
// DiscoverPlace/DiscoverBusiness. Discover's own cards have no use for a
// single cover photo (discover-place-detail.tsx/discover-business-
// detail.tsx read the full place_photos/business_photos set for their own gallery,
// a different concern), so this stays scoped to Home's own read, same
// reasoning verified_at's own comment already gives. null means the item
// has no photo yet, the exact signal home-query.ts's new fetch uses to
// split an item into a category row versus the photo-less fallback list.
export type RecentlyVerifiedPlace = DiscoverPlace & {
  verified_at: string;
  coverPhotoUrl: string | null;
};
export type RecentlyVerifiedBusiness = DiscoverBusiness & {
  verified_at: string;
  coverPhotoUrl: string | null;
};
export type RecentlyVerifiedItem = RecentlyVerifiedPlace | RecentlyVerifiedBusiness;

// home-photo-showcase-phases.md Phase 1.2: one row's own shape, shared
// between place category rows and business category rows since a row
// looks the same either way once built -- a category id, its live name
// (read straight off place_categories/business_categories, not a second
// copy of the name), and the photo-having items inside it. items reuses
// RecentlyVerifiedItem rather than a narrower type, since a row's cards
// need exactly the same fields (id, name, kind, coverPhotoUrl) that type
// already carries, no new per-row item shape needed.
export interface CategoryRow {
  categoryId: string;
  categoryName: string;
  items: RecentlyVerifiedItem[];
}
