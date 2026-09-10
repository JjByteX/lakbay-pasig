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
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  verification_status: "verified";
}

export interface DiscoverBusiness {
  kind: "business";
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  verification_status: "verified" | "pending";
  // Phase 7.1 (step-5-phases.md): item prices only, not full business_items
  // rows (name, id), since the price filter is the only thing that needs
  // this data at the Discover-list level; the full item list with names
  // stays a detail-page concern (Phase 6.4, discover-business-detail.tsx's
  // own separate business_items query). A place never carries this field,
  // per data-model.md places have no item/price concept, so the price
  // filter naturally excludes every place result without a special case.
  itemPrices: (number | null)[];
}

export type DiscoverResult = DiscoverPlace | DiscoverBusiness;

// Phase 5.4 (step-5-phases.md): "fixed category lists already enforced by
// the places and businesses check constraints." places.category has a
// check constraint (migration 0003); businesses.category does not
// (migration 0004, free text, no fixed list at the DB layer — noted in
// architecture-notes.md's Phase 3 entry and deferred here). So the filter's
// option list is places' five values only, matching admin-place-detail.tsx's
// own CATEGORIES constant (same five, kept in sync manually since that one
// is a page-local const, not exported). Applied to the combined result set
// by exact match on the category field either kind carries, a business
// whose free-text category happens to match one of the five still filters
// in correctly; one not matching any of the five just won't appear under
// a specific category, it still shows under "All categories".
export const DISCOVER_CATEGORIES = [
  "Heritage Site",
  "Museum",
  "Monument",
  "Church",
  "Cultural Site",
] as const;
