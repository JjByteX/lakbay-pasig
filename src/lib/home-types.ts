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
export type RecentlyVerifiedPlace = DiscoverPlace & { verified_at: string };
export type RecentlyVerifiedBusiness = DiscoverBusiness & { verified_at: string };
export type RecentlyVerifiedItem = RecentlyVerifiedPlace | RecentlyVerifiedBusiness;
