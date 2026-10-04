import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { fetchCoverPhotoUrls } from "./home-query";
import { useAuth } from "./auth-context";
import type { Coordinates } from "./discover-query";
import { useUserLocation } from "@/components/public/public-shell";

/**
 * Recommendations (recommendation-plan.md, recommendation-phases.md Phase 6).
 * Client side of recommend_items (migration 0046): the Home row ("For you" /
 * "Near you" / "Around Pasig") and the "Similar" row on detail pages are the
 * same call, with and without an anchor item.
 *
 * recommend_items returns slim rows (kind, id, reason, distance_km), not table
 * rows, because one row type cannot cover places and businesses. The cards are
 * then loaded with ordinary queries, the way global-search.ts's searchItems
 * does it (decision-log.md entries #29 and #31): a plain .rpc() with nothing
 * chained on it, since an embed or filter chained onto an .rpc() made
 * PostgREST answer 400. The status filter is repeated here, because owner and
 * staff policies on places and businesses are wider than the public ones.
 *
 * Nothing in this file reads a view or save count, a report, or any other
 * user's data (the Rules section of recommendation-plan.md lists the columns).
 * Location is sent per request and never stored or logged.
 */

export type RecommendationKind = "place" | "business";

export interface RecommendationAnchor {
  kind: RecommendationKind;
  id: string;
}

// A card as the row needs it. Deliberately not DiscoverPlace or
// DiscoverBusiness: those already have five constructors (architecture-
// notes.md), and this row only shows a photo, a name, a badge and a reason.
export interface RecommendationCard {
  kind: RecommendationKind;
  id: string;
  name: string;
  coverPhotoUrl: string | null;
  verification_status: "verified" | "pending";
  // "Similar to X", "Open now", "Near you", or null (no line is shown).
  reason: string | null;
  distanceKm: number | null;
}

export interface RecommendationResult {
  cards: RecommendationCard[];
  // True when the function could use the location (any distance came back).
  // False drives the "Around Pasig" title.
  locationUsed: boolean;
}

export interface HiddenItem {
  kind: RecommendationKind;
  id: string;
  name: string;
}

interface RecommendRow {
  kind: string;
  id: string;
  reason: string | null;
  distance_km: number | null;
}

export const itemKey = (item: { kind: RecommendationKind; id: string }) =>
  `${item.kind}:${item.id}`;

const isKind = (kind: string): kind is RecommendationKind =>
  kind === "place" || kind === "business";

/**
 * Names and statuses for a set of places and businesses, through the caller's
 * own policies plus the explicit status filter. An item the caller cannot see,
 * or that is no longer verified (places) or verified/pending (businesses), has
 * no entry. Used for the cards and for the Hidden items list.
 */
async function loadItems(
  refs: { kind: RecommendationKind; id: string }[]
): Promise<Map<string, { name: string; status: "verified" | "pending" }>> {
  const placeIds = refs.filter((r) => r.kind === "place").map((r) => r.id);
  const businessIds = refs.filter((r) => r.kind === "business").map((r) => r.id);

  const [placesRes, businessesRes] = await Promise.all([
    placeIds.length === 0
      ? { data: [], error: null }
      : supabase
          .from("places")
          .select("id, name")
          .in("id", placeIds)
          .eq("verification_status", "verified"),
    businessIds.length === 0
      ? { data: [], error: null }
      : supabase
          .from("businesses")
          .select("id, name, verification_status")
          .in("id", businessIds)
          .in("verification_status", ["verified", "pending"]),
  ]);

  if (placesRes.error) throw placesRes.error;
  if (businessesRes.error) throw businessesRes.error;

  const found = new Map<string, { name: string; status: "verified" | "pending" }>();
  for (const row of placesRes.data ?? []) {
    found.set(itemKey({ kind: "place", id: row.id }), { name: row.name, status: "verified" });
  }
  for (const row of businessesRes.data ?? []) {
    found.set(itemKey({ kind: "business", id: row.id }), {
      name: row.name,
      status: row.verification_status as "verified" | "pending",
    });
  }
  return found;
}

/**
 * One call to recommend_items, then the cards. The function's order is kept,
 * and any row that did not load (no longer visible, or its status changed
 * since the call) is dropped. A cover photo failure only leaves the card on
 * its muted fill, it never hides the card (photo count is not a score input,
 * so a card without one must show fine).
 */
export async function fetchRecommendations(
  coords: Coordinates | null,
  anchor?: RecommendationAnchor,
  lim = 12
): Promise<RecommendationResult> {
  const { data, error } = await supabase.rpc("recommend_items", {
    lat: coords?.latitude ?? null,
    lng: coords?.longitude ?? null,
    lim,
    anchor_kind: anchor?.kind ?? null,
    anchor_id: anchor?.id ?? null,
  });
  if (error) throw error;

  const rows = (Array.isArray(data) ? (data as RecommendRow[]) : []).filter((row) =>
    isKind(row.kind)
  );
  if (rows.length === 0) return { cards: [], locationUsed: false };

  const refs = rows.map((row) => ({ kind: row.kind as RecommendationKind, id: row.id }));
  const [items, placeCovers, businessCovers] = await Promise.all([
    loadItems(refs),
    fetchCoverPhotoUrls("place_photos", "place_id", refs.filter((r) => r.kind === "place").map((r) => r.id)).catch(
      () => new Map<string, string>()
    ),
    fetchCoverPhotoUrls(
      "business_photos",
      "business_id",
      refs.filter((r) => r.kind === "business").map((r) => r.id)
    ).catch(() => new Map<string, string>()),
  ]);

  const cards = rows.flatMap((row): RecommendationCard[] => {
    const kind = row.kind as RecommendationKind;
    const item = items.get(itemKey({ kind, id: row.id }));
    if (!item) return [];
    const covers = kind === "place" ? placeCovers : businessCovers;
    return [
      {
        kind,
        id: row.id,
        name: item.name,
        coverPhotoUrl: covers.get(row.id) ?? null,
        verification_status: item.status,
        reason: row.reason,
        distanceKm: row.distance_km,
      },
    ];
  });

  return { cards, locationUsed: rows.some((row) => row.distance_km !== null) };
}

// "Not interested" (rec_hides, migration 0046). One row per user and item, own
// rows only (rec_hides_own). Hides one item for the recommendation rows, never
// a category, never a taste signal. Shaped like saved-places.ts.

// ON CONFLICT DO NOTHING, so a double tap is not an error.
export async function hideItem(
  userId: string,
  kind: RecommendationKind,
  itemId: string
): Promise<void> {
  const { error } = await supabase
    .from("rec_hides")
    .upsert(
      { user_id: userId, kind, item_id: itemId },
      { onConflict: "user_id,kind,item_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function unhideItem(
  userId: string,
  kind: RecommendationKind,
  itemId: string
): Promise<void> {
  const { error } = await supabase
    .from("rec_hides")
    .delete()
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("item_id", itemId);
  if (error) throw error;
}

/**
 * The caller's hidden items, newest first, with names for the Hidden items
 * block in Settings. Items the caller can no longer see are skipped.
 */
export async function fetchHidden(userId: string): Promise<HiddenItem[]> {
  const { data, error } = await supabase
    .from("rec_hides")
    .select("kind, item_id")
    .eq("user_id", userId)
    .order("hidden_at", { ascending: false });
  if (error) throw error;

  const refs = (data ?? [])
    .filter((row) => isKind(row.kind))
    .map((row) => ({ kind: row.kind as RecommendationKind, id: row.item_id as string }));
  if (refs.length === 0) return [];

  const items = await loadItems(refs);
  return refs.flatMap((ref) => {
    const item = items.get(itemKey(ref));
    return item ? [{ ...ref, name: item.name }] : [];
  });
}

// How long the first fetch waits for a location fix before it goes without.
const FIRST_FIX_WAIT_MS = 2000;

/**
 * The one place for timing, shared by Home and the Similar rows so neither
 * keeps its own copy.
 *
 * Fetch rules: the first fetch runs on the first location fix, or after
 * FIRST_FIX_WAIT_MS, whichever comes first. If the wait ran out and a fix
 * arrives later, one more fetch runs. After that, movement never refetches
 * (the live watch fires about once a second, decision-log.md entry #16, and
 * the row is meant to stay put). A sign in or sign out, or a different anchor,
 * starts over.
 *
 * Reads useUserLocation, so there is no second geolocation call.
 *
 * ponytail: the row is fetched once per fix state, not as the person walks.
 * A tourist who crosses into Pasig after the first fetch sees "Around Pasig"
 * until the next visit to Home. Refetch on a large move only if that shows up
 * in real use.
 */
export function useRecommendations(anchor?: RecommendationAnchor) {
  const { userLocation } = useUserLocation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const anchorKind = anchor?.kind ?? null;
  const anchorId = anchor?.id ?? null;
  const key = `${userId ?? "guest"}|${anchorKind ?? ""}|${anchorId ?? ""}`;
  const hasFix = userLocation !== null;

  // The latest position, read when a fetch starts. Not a dependency of the
  // fetch effect, so movement alone never refetches.
  const coordsRef = useRef(userLocation);
  useEffect(() => {
    coordsRef.current = userLocation;
  }, [userLocation]);

  const [result, setResult] = useState<RecommendationResult & { key: string }>({
    key: "",
    cards: [],
    locationUsed: false,
  });
  // Items hidden in this view. The card stays in `cards` and the row shows its
  // "Hidden. Undo" line until the next fetch, which leaves it out.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const [hideError, setHideError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const target = anchorKind && anchorId ? { kind: anchorKind, id: anchorId } : undefined;

    const run = (coords: Coordinates | null) => {
      fetchRecommendations(coords, target)
        .then((next) => {
          if (cancelled) return;
          setResult({ key, ...next });
          setHiddenIds(new Set());
        })
        .catch(() => {
          // The row is optional and never blocks the page: a failed first
          // fetch shows nothing, a failed second fetch keeps the first.
          if (!cancelled) {
            setResult((prev) => (prev.key === key ? prev : { key, cards: [], locationUsed: false }));
          }
        });
    };

    if (hasFix) {
      run(coordsRef.current);
      return () => {
        cancelled = true;
      };
    }
    const timer = setTimeout(() => run(null), FIRST_FIX_WAIT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, hasFix, anchorKind, anchorId]);

  // Optimistic: the card turns into the Hidden line at once, and goes back if
  // the write fails.
  const hide = useCallback(
    async (card: { kind: RecommendationKind; id: string }) => {
      if (!userId) return;
      const k = itemKey(card);
      setHideError(null);
      setHiddenIds((prev) => new Set(prev).add(k));
      try {
        await hideItem(userId, card.kind, card.id);
      } catch {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
        setHideError("Couldn't hide this. Try again.");
      }
    },
    [userId]
  );

  const undo = useCallback(
    async (card: { kind: RecommendationKind; id: string }) => {
      if (!userId) return;
      setHideError(null);
      try {
        await unhideItem(userId, card.kind, card.id);
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(itemKey(card));
          return next;
        });
      } catch {
        setHideError("Couldn't undo. Try again.");
      }
    },
    [userId]
  );

  const loading = result.key !== key;
  return {
    cards: loading ? [] : result.cards,
    loading,
    locationUsed: !loading && result.locationUsed,
    // Guests cannot hide (they store nothing), so the row only shows the
    // control when this is true.
    canHide: userId !== null,
    hide,
    undo,
    hiddenIds,
    hideError,
  };
}
