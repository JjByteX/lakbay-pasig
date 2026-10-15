import { supabase } from "./supabase";
import { readUnlockedIds, writeUnlock } from "./offline/queue";

/**
 * Discovery content entries a visitor has unlocked by scanning a QR code
 * (entry_unlocks, migration 0050, owner-only RLS via entry_unlocks_own).
 * Same shape as trail-progress.ts: plain reads and writes keyed by the
 * signed-in user. One row per user per entry (unique (user_id, entry_id)),
 * so unlocking is an upsert, and scanning the same code twice is harmless.
 */

// Phase 8 (offline-phases.md): the two functions below go through
// offline/queue.ts. Online they behave as before and keep a copy on the device.
// Offline the read answers from that copy, and an unlock is queued and replays
// when the connection returns. fetchEntryByToken further down is a public read
// and stays as it is: a trail download stores it (offline/reads.ts), so a
// scanned code can be checked against the device.
export async function fetchUnlockedEntryIds(userId: string, entryIds: string[]): Promise<Set<string>> {
  if (entryIds.length === 0) return new Set();

  return readUnlockedIds(userId, entryIds, async () => {
    const { data, error } = await supabase
      .from("entry_unlocks")
      .select("entry_id")
      .eq("user_id", userId)
      .in("entry_id", entryIds);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.entry_id));
  });
}

export async function unlockEntry(userId: string, entryId: string): Promise<void> {
  await writeUnlock(userId, entryId, async () => {
    const { error } = await supabase
      .from("entry_unlocks")
      .upsert({ user_id: userId, entry_id: entryId }, { onConflict: "user_id,entry_id" });

    if (error) throw error;
  });
}

// What the scan page needs from a scanned code: which entry it opens and
// which place or business it belongs to. Read through
// discovery_content_select_public (0050, widened in 0054), so a code whose
// place is in no published trail and none of the caller's own personal trails
// finds nothing, same as a code that does not exist.
export interface ScannedEntry {
  id: string;
  related_location_type: "place" | "business";
  related_location_id: string;
}

export async function fetchEntryByToken(token: string): Promise<ScannedEntry | null> {
  const { data, error } = await supabase
    .from("discovery_content")
    .select("id, related_location_type, related_location_id")
    .eq("qr_token", token)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    related_location_type: data.related_location_type as "place" | "business",
    related_location_id: data.related_location_id,
  };
}
