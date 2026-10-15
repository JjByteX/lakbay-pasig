import { supabase } from "../supabase";
import { isOnline } from "./status";
import { failReason } from "./rules";
import {
  addDropped,
  clearUserCopy,
  enqueueOp,
  readProgress,
  readQueue,
  readSaved,
  readUnlocks,
  removeQueued,
  replaceSaved,
  replaceUnlocks,
  setSaved,
  setUnlock,
  writeProgress as storeProgress,
  type StoredProgress,
} from "./mine";
import {
  canReplay,
  replayOps,
  replayOutcome,
  type QueueOp,
  type ReplayError,
  type SaveKind,
} from "./queue-rules";

// Own data and the write queue (offline-phases.md, Phase 8). The six query
// files (saved-places.ts, saved-businesses.ts, saved-routes.ts,
// trail-progress.ts, entry-unlocks.ts, trail-scan.ts) keep their own network
// code and hand it to the helpers here:
//
// - reads go to the network first and keep a copy in mine.ts. When the network
//   is down they answer from that copy.
// - writes update the copy first, then try the network. A lost connection puts
//   the write on the queue and the call still succeeds, so the control keeps
//   its new state. Any other error reverts the copy and throws, as before.
//
// Everything here is for the signed in user id the caller passes. Guests never
// reach it: their controls open sign in instead of calling these.

const SAVE_TABLES: Record<SaveKind, { table: string; column: string }> = {
  place: { table: "saved_places", column: "place_id" },
  business: { table: "saved_businesses", column: "business_id" },
  route: { table: "saved_routes", column: "route_id" },
};

function asReplayError(err: unknown): ReplayError {
  return typeof err === "object" && err !== null ? (err as ReplayError) : { message: String(err) };
}

function isNetwork(err: unknown): boolean {
  return failReason(err) === "network";
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

function enqueue(userId: string, op: QueueOp): Promise<boolean> {
  return enqueueOp(userId, { id: nextId(), op });
}

async function sessionUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

// ---- Replay ----------------------------------------------------------------

async function sendOp(userId: string, op: QueueOp): Promise<ReplayError | null> {
  if (op.kind === "save") {
    const { table, column } = SAVE_TABLES[op.target];
    const res = op.saved
      ? await supabase.from(table).insert({ user_id: userId, [column]: op.id })
      : await supabase.from(table).delete().eq("user_id", userId).eq(column, op.id);
    return res.error;
  }
  if (op.kind === "progress") {
    const res = await supabase.from("route_progress").upsert(
      {
        user_id: userId,
        route_id: op.routeId,
        highest_unlocked_stop_id: op.stopId,
        unlocked_at: op.at,
      },
      { onConflict: "user_id,route_id" }
    );
    return res.error;
  }
  const res = await supabase
    .from("entry_unlocks")
    .upsert({ user_id: userId, entry_id: op.entryId }, { onConflict: "user_id,entry_id" });
  return res.error;
}

let running: Promise<void> | null = null;
// After a run that had to stop, reads and writes do not start another for a
// while, so a write the server keeps refusing cannot slow every screen.
const BACKOFF_MS = 30_000;
let backoffUntil = 0;

async function run(): Promise<void> {
  if (!isOnline()) return;
  const userId = await sessionUserId();
  if (!userId) return;
  const queue = await readQueue(userId);
  if (!queue || queue.length === 0) return;

  const result = await replayOps(queue, {
    send: (op) => sendOp(userId, op),
    isNetwork,
    stillOwner: async () => canReplay(userId, await sessionUserId()),
    settled: async (item) => {
      await removeQueued(userId, item.id);
    },
  });
  if (result.dropped > 0) await addDropped(userId, result.dropped);
  if (result.stopped) backoffUntil = Date.now() + BACKOFF_MS;
}

// Replays the signed in user's waiting writes, oldest first. One run at a time:
// a second call gets the run already going. Never throws.
export function replayQueue(): Promise<void> {
  if (!running) {
    running = run()
      .catch(() => undefined)
      .finally(() => {
        running = null;
      });
  }
  return running;
}

// Before an online read or write, send what is waiting for this user, so the
// server's answer includes it and a new write cannot be undone by an old one.
export async function settle(userId: string): Promise<void> {
  if (!isOnline() || Date.now() < backoffUntil) return;
  const queue = await readQueue(userId);
  if (queue && queue.length > 0) await replayQueue();
}

// ---- Reads -----------------------------------------------------------------

// Network first. `keep` stores what came back. A lost connection falls back to
// `fromCopy`, and when there is no copy either the original error is thrown.
export async function readWithCopy<T>(
  userId: string,
  fromNetwork: () => Promise<T>,
  fromCopy: () => Promise<T | undefined>,
  keep: (value: T) => Promise<unknown>
): Promise<T> {
  await settle(userId);
  try {
    const value = await fromNetwork();
    await keep(value);
    return value;
  } catch (err) {
    if (isNetwork(err)) {
      const copy = await fromCopy();
      if (copy !== undefined) return copy;
    }
    throw err;
  }
}

export function readSavedIds(userId: string, kind: SaveKind, fromNetwork: () => Promise<Set<string>>): Promise<Set<string>> {
  return readWithCopy(
    userId,
    fromNetwork,
    () => readSaved(userId, kind),
    (ids) => replaceSaved(userId, kind, ids)
  );
}

export function readIsSaved(userId: string, kind: SaveKind, id: string, fromNetwork: () => Promise<boolean>): Promise<boolean> {
  return readWithCopy(
    userId,
    fromNetwork,
    async () => (await readSaved(userId, kind))?.has(id),
    (saved) => setSaved(userId, kind, id, saved)
  );
}

export function readRouteProgress(
  userId: string,
  routeId: string,
  fromNetwork: () => Promise<StoredProgress | null>
): Promise<StoredProgress | null> {
  return readWithCopy(
    userId,
    fromNetwork,
    () => readProgress(userId, routeId),
    (progress) => storeProgress(userId, routeId, progress)
  );
}

export function readUnlockedIds(
  userId: string,
  entryIds: string[],
  fromNetwork: () => Promise<Set<string>>
): Promise<Set<string>> {
  return readWithCopy(
    userId,
    fromNetwork,
    () => readUnlocks(userId, entryIds),
    (unlocked) => replaceUnlocks(userId, entryIds, unlocked)
  );
}

// ---- Writes ----------------------------------------------------------------

// Save or unsave. Returns the new saved state, like the toggle functions do.
// A save the server already has (23505) counts as saved.
export async function writeSaved(
  kind: SaveKind,
  userId: string,
  id: string,
  saved: boolean,
  send: () => Promise<void>
): Promise<boolean> {
  await settle(userId);
  await setSaved(userId, kind, id, saved);
  try {
    await send();
    return saved;
  } catch (err) {
    if (replayOutcome(asReplayError(err), false) === "done") return saved;
    if (isNetwork(err) && (await enqueue(userId, { kind: "save", target: kind, id, saved }))) return saved;
    await setSaved(userId, kind, id, !saved);
    throw err;
  }
}

// Start or advance a trail. `send` gets the time to write as unlocked_at, so a
// replayed row keeps the moment the stop opened.
export async function writeStop(
  userId: string,
  routeId: string,
  stopId: string,
  order: number,
  send: (at: string) => Promise<void>
): Promise<void> {
  await settle(userId);
  const at = new Date().toISOString();
  const before = await readProgress(userId, routeId);
  await storeProgress(userId, routeId, { highestUnlockedStopId: stopId, unlockedAt: at });
  try {
    await send(at);
  } catch (err) {
    if (isNetwork(err) && (await enqueue(userId, { kind: "progress", routeId, stopId, order, at }))) return;
    await storeProgress(userId, routeId, before ?? null);
    throw err;
  }
}

export async function writeUnlock(userId: string, entryId: string, send: () => Promise<void>): Promise<void> {
  await settle(userId);
  await setUnlock(userId, entryId, true);
  try {
    await send();
  } catch (err) {
    if (isNetwork(err) && (await enqueue(userId, { kind: "unlock", entryId }))) return;
    await setUnlock(userId, entryId, false);
    throw err;
  }
}

// A restart deletes the row. It stays an online action: the copy follows once
// the server has done it.
export async function writeReset(userId: string, routeId: string, send: () => Promise<void>): Promise<void> {
  await settle(userId);
  await send();
  await storeProgress(userId, routeId, null);
}

// ---- Auth ------------------------------------------------------------------

let started = false;

// Runs once (initOffline). Replays when an account signs in, and clears the
// copy when it signs out. lib/offline listens here so auth-context.tsx stays
// untouched. Waiting writes are not cleared: they stay under the user id and
// replay at that user's next sign in.
//
// The callback only schedules work. supabase-js can deadlock if a callback
// calls back into its auth methods while it is still running.
export function startQueue(): void {
  if (started) return;
  started = true;
  let lastUser: string | null = null;
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      lastUser = session.user.id;
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") setTimeout(() => void replayQueue(), 0);
      return;
    }
    if (event === "SIGNED_OUT" && lastUser) {
      const owner = lastUser;
      lastUser = null;
      setTimeout(() => void clearUserCopy(owner), 0);
    }
  });
}
