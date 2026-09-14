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
  // Phase 2.1 (feature-request-phases.md): facilities exist only on
  // Local Historical Place records today, confirmed against
  // data-model.md and places.facility_ids (migration 0026/0028) before
  // scoping this field to DiscoverPlace only -- DiscoverBusiness has no
  // equivalent, same reasoning itemPrices below is place-absent for the
  // opposite case. A place always has an array here (possibly empty),
  // never null, matching facility_ids' own not-null default ('{}').
  facility_ids: string[];
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
