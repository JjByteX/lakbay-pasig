// Phase 3.2 (step-5-phases.md): one typed result set Discover renders from,
// per step-5-plan.md's Shape section (one combined view, not separate data
// paths per surface). `kind` is the discriminator result cards, detail
// routing (Phase 6.2), and the verification label all branch on.
//
// Only summary fields live here, per Phase 3.1, enough for a map marker and
// a result card. Full record fields (historical background, item list with
// prices, etc.) are fetched separately in Phase 6's detail page, scoped
// through the same RLS policies these summary queries already use.
export interface DiscoverPlace {
  kind: "place";
  id: string;
  name: string;
  category: string;
  // Map-marker-icons phase: place_categories.icon, joined alongside the
  // already-joined category name (discover-query.ts's fetchPlaces), not a
  // second query -- lets the map marker draw the same category icon
  // MapLegend and the admin category picker already draw for this value,
  // via place-category-icons.ts's own getCategoryIcon lookup. Falls back
  // to that lookup's own MapPin default if a category was deleted after
  // this place was tagged with it (same null-safety readEmbeddedIcon
  // already gives category itself).
  categoryIcon: string | null;
  // Category Colors: place_categories.color, joined in the same embed as
  // categoryIcon. A palette key (category-colors.ts), null when the
  // category has no color set, which the map reads as blue.
  categoryColor: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  verification_status: "verified";
  // Phase 2.1 (feature-request-phases.md): facilities exist only on
  // Local Historical Place records today, confirmed against
  // data-model.md and places.facility_ids (migration 0026/0028) before
  // scoping this field to DiscoverPlace only -- DiscoverBusiness has no
  // equivalent, same reasoning items below is place-absent for the
  // opposite case. A place always has an array here (possibly empty),
  // never null, matching facility_ids' own not-null default ('{}').
  facility_ids: string[];
  // Map hover/full-details photos phase: the same lowest-sort_order
  // place_photos.photo_url home-query.ts's fetchHomeShowcase already
  // computes for the Home tab, via that file's now-exported
  // fetchCoverPhotoUrls, reused rather than a second cover-photo query.
  // null means no photo row exists yet for this place, same "absence is
  // null" convention every other optional field on this type already
  // uses (description, latitude/longitude).
  coverPhotoUrl: string | null;
}

export interface DiscoverBusiness {
  kind: "business";
  id: string;
  name: string;
  category: string | null;
  // Map-marker-icons phase: business_categories.icon, same reasoning as
  // DiscoverPlace.categoryIcon above, via business-category-icons.ts's
  // getBusinessCategoryIcon.
  categoryIcon: string | null;
  // Category Colors: business_categories.color, same reasoning as
  // DiscoverPlace.categoryColor above.
  categoryColor: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  verification_status: "verified" | "pending";
  // Items carry name and price for the price filter and the search match
  // (item-match.ts). Places never carry them.
  items: { name: string; price: number | null }[];
  // Map hover/full-details photos phase: same reasoning as
  // DiscoverPlace.coverPhotoUrl above, sourced from business_photos
  // instead of place_photos via the same fetchCoverPhotoUrls helper.
  coverPhotoUrl: string | null;
}

export type DiscoverResult = DiscoverPlace | DiscoverBusiness;
