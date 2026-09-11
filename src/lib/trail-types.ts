// Step 7, Phase 1.1: mirrors discover-types.ts's shape, per step-7-trail-
// plan.md's Data Layer section. Two levels, same split discover-types.ts
// already draws between a summary shape (catalog row) and a full-detail
// shape (single record page), not one shape trying to serve both.

/**
 * Catalog row, trail-card.tsx's render. Summary fields only, matching
 * step-7-trail-plan.md's Trail catalog page: "Name, theme, duration,
 * budget." routes.status is not carried here, fetchPublishedTrails
 * (trail-query.ts) only ever selects published rows via
 * routes_select_public (0005), so every TrailSummary in hand is already
 * known-published, same reasoning discover-types.ts's DiscoverPlace uses
 * for its own verification_status narrowing.
 */
export interface TrailSummary {
  id: string;
  name: string;
  theme: string | null;
  estimated_duration: string | null;
  estimated_budget: string | null;
  run_type: string | null;
  // Credential name only, not the full trail_credentials row: the
  // catalog row has no use for requirement_to_earn, that's a detail-page
  // concern (TrailCredential below). Null when the route has no linked
  // credential, per the plan doc's "credential name if one exists."
  credentialName: string | null;
}

/**
 * One stop within a trail's sequence. `name` is resolved client side
 * from places or businesses, same as admin-trail-builder.tsx's StopRow
 * (route_stops.stop_id has no foreign key, migration 0005's own comment:
 * "app layer must guarantee stop_type/related_location_type matches a
 * real row"). `discoveryContent` is null for a stop with no attached
 * content, this is a normal, valid state, not a fetch failure: not every
 * stop in the seed data carries a discovery_content row (data-model.md's
 * rule that only proximity-triggered secrets belong there, general
 * background stays on the place/business page instead).
 *
 * `latitude`/`longitude` (Phase 4.5): resolved client side from the same
 * places/businesses row `name` already comes from, added alongside it
 * rather than as a separate fetch. A stop's own location is the place or
 * business it points at, there is no separate coordinate anywhere else
 * on route_stops or discovery_content (grepped admin-trail-builder.tsx
 * and migration 0005, neither stores one) — the proximity check
 * step-7-phases.md's Phase 4.5 requires has to compare against
 * something, and this is the only real source. Nullable, matching
 * places.latitude/longitude and businesses.latitude/longitude
 * (migrations 0003, 0004), which discover-query.ts's DiscoverPlace/
 * DiscoverBusiness already treat as optional for the same reason (not
 * every place/business row has a geocoded address yet).
 */
export interface TrailStop {
  id: string;
  stop_type: "place" | "business";
  stop_id: string;
  sequence_order: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  discoveryContent: TrailDiscoveryContent | null;
}

/**
 * Public-read shape of a discovery_content row. needs_place_review is
 * deliberately left out here, unlike admin-trail-builder.tsx's own
 * DiscoveryContentRow (staff-only field per that file's own comment,
 * this page never reads it back into a form) — a Guest or Registered
 * User has no use for a staff review-routing flag, and
 * discovery_content_select_public (0005) already gates the row itself on
 * status = 'active' and the parent route being published, before this
 * type is ever populated.
 */
export interface TrailDiscoveryContent {
  id: string;
  title: string;
  content: string;
  unlock_radius: number;
}

/**
 * trail_credentials row, trail_credentials_select_public (0007) is a
 * fully open read (`using (true)`), so every field is safe to carry here
 * unlike discovery_content above.
 */
export interface TrailCredential {
  id: string;
  credential_name: string;
  requirement_to_earn: string | null;
}

/**
 * Full single-route detail, trail-detail.tsx's (Phase 3) render target.
 * Superset of TrailSummary's fields plus the sequenced stop list and the
 * full credential record (not just its name), per step-7-trail-plan.md's
 * Trail detail page: "stop list in order, theme, duration, budget, run
 * type, credential name if one exists."
 */
export interface TrailDetail {
  id: string;
  name: string;
  theme: string | null;
  estimated_duration: string | null;
  estimated_budget: string | null;
  run_type: string | null;
  stops: TrailStop[];
  credential: TrailCredential | null;
}
