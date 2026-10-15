import { fetchDiscoverResults } from "../discover-query";
import { fetchAnnouncements } from "../home-query";
import { fetchPublishedTrails } from "../trail-query";
import { BARANGAYS, fetchPublishedFiestasForBarangay, type PublicFiesta } from "../fiestas";
import type { DiscoverBusiness, DiscoverPlace } from "../discover-types";
import type { TrailSummary } from "../trail-types";
import type { Announcement } from "../home-types";
import type { GlobalSearchResults } from "../global-search";
import { readMeta } from "./meta";

/**
 * Search with no connection (offline-plan.md, What stops working offline).
 * The search functions are RPC calls, which cannot be stored, so offline the
 * bar filters the downloaded lists by name instead: the same reads the Download
 * stored, served from the device. Lowercase and accent-insensitive, a plain
 * "contains" match, no typo tolerance.
 */
const RESULT_LIMIT = 5;
const ITEM_LIMIT = 4;

interface Snapshot {
  places: DiscoverPlace[];
  businesses: DiscoverBusiness[];
  trails: TrailSummary[];
  events: Announcement[];
  fiestas: PublicFiesta[];
}

// Kept for the session, and rebuilt when a sync brings new data.
let snapshot: Promise<Snapshot> | null = null;
let snapshotFor: number | null = null;

async function pull(): Promise<Snapshot> {
  const [results, trails, events] = await Promise.all([
    fetchDiscoverResults(),
    fetchPublishedTrails(),
    fetchAnnouncements(),
  ]);
  const fiestas = new Map<string, PublicFiesta>();
  const lists = await Promise.all(BARANGAYS.map((b) => fetchPublishedFiestasForBarangay(b).catch(() => [])));
  for (const list of lists) for (const fiesta of list) fiestas.set(fiesta.id, fiesta);

  return {
    places: results.filter((r): r is DiscoverPlace => r.kind === "place"),
    businesses: results.filter((r): r is DiscoverBusiness => r.kind === "business"),
    trails,
    events,
    fiestas: [...fiestas.values()],
  };
}

function load(): Promise<Snapshot> {
  const syncedAt = readMeta().syncedAt;
  if (!snapshot || snapshotFor !== syncedAt) {
    snapshotFor = syncedAt;
    snapshot = pull().catch((err) => {
      snapshot = null;
      throw err;
    });
  }
  return snapshot;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export async function searchOffline(query: string): Promise<GlobalSearchResults> {
  const q = normalize(query.trim());
  const data = await load();
  const has = (name: string) => normalize(name).includes(q);

  const items: GlobalSearchResults["items"] = [];
  for (const business of data.businesses) {
    business.items.forEach((item, index) => {
      if (items.length >= ITEM_LIMIT || !has(item.name)) return;
      items.push({
        kind: "item",
        // Items carry no id in the downloaded list, so the key is made from the store.
        id: `${business.id}:${index}`,
        name: item.name,
        price: item.price,
        photoUrl: null,
        businessId: business.id,
        businessName: business.name,
        verification_status: business.verification_status,
      });
    });
  }

  return {
    places: data.places
      .filter((p) => has(p.name))
      .slice(0, RESULT_LIMIT)
      .map((p) => ({ kind: "place" as const, id: p.id, name: p.name, category: p.category })),
    businesses: data.businesses
      .filter((b) => has(b.name))
      .slice(0, RESULT_LIMIT)
      .map((b) => ({
        kind: "business" as const,
        id: b.id,
        name: b.name,
        category: b.category,
        verification_status: b.verification_status,
      })),
    trails: data.trails
      .filter((t) => has(t.name))
      .slice(0, RESULT_LIMIT)
      .map((t) => ({ kind: "trail" as const, id: t.id, name: t.name, theme: t.theme, personal: false })),
    events: data.events
      .filter((e) => has(e.title))
      .slice(0, RESULT_LIMIT)
      .map((e) => ({ kind: "event" as const, id: e.id, title: e.title, category: e.category })),
    fiestas: data.fiestas
      .filter((f) => has(f.name))
      .slice(0, RESULT_LIMIT)
      .map((f) => ({ kind: "fiesta" as const, id: f.id, name: f.name, date_label: f.date_label })),
    items,
  };
}
