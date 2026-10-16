import { useEffect, useSyncExternalStore } from "react";
import { addOp, type QueuedOp, type SaveKind } from "./queue-rules";

// A signed in user's own data on this device (offline-phases.md, Phase 8.3):
// saved ids, trail progress, unlocked entries and the write queue. Native
// IndexedDB, no library. Never part of the shared Cache API store, so the next
// person on the phone cannot see it.
//
// Every key starts with the user id, so one user's rows can be read or cleared
// by prefix and never touch another's. Every call is wrapped: when IndexedDB is
// missing or fails, a read answers undefined (there is no copy) and a write
// answers false, and the caller behaves as it did before this file existed.

type Store = "saved" | "progress" | "unlocks" | "queue";
const STORES: Store[] = ["saved", "progress", "unlocks", "queue"];

// What route_progress holds, same shape as trail-progress.ts's RouteProgress.
export interface StoredProgress {
  highestUnlockedStopId: string;
  unlockedAt: string;
}

let opened: Promise<IDBDatabase> | null = null;

// A rejection should carry an Error. An IndexedDB request or transaction has
// its error set only after it fails, and the type allows null.
function failure(error: DOMException | null, fallback: string): Error {
  return error ?? new Error(fallback);
}

function database(): Promise<IDBDatabase> {
  if (opened) return opened;
  const attempt = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open("lakbay-mine", 1);
    request.onupgradeneeded = () => {
      for (const name of STORES) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(request.error, "IndexedDB could not be opened."));
    request.onblocked = () => reject(new Error("IndexedDB is blocked."));
  });
  // A failed open is tried again on the next call.
  attempt.catch(() => {
    opened = null;
  });
  opened = attempt;
  return attempt;
}

// Generic over the request itself, not its result type. IDBRequest is invariant
// in its result, so a union such as `x ? store.put(...) : store.delete(...)`
// (IDBRequest<IDBValidKey> or IDBRequest<undefined>) cannot infer one T.
function result<R extends IDBRequest>(request: R): Promise<R["result"]> {
  return new Promise<R["result"]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(request.error, "An IndexedDB request failed."));
  });
}

async function inStore<T>(name: Store, mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const tx = (await database()).transaction(name, mode);
  const finished = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(failure(tx.error, "An IndexedDB transaction failed."));
    tx.onabort = () => reject(failure(tx.error, "An IndexedDB transaction was aborted."));
  });
  // A failure inside work() aborts the transaction, which rejects `finished`
  // with nobody waiting on it.
  finished.catch(() => undefined);
  try {
    const value = await work(tx.objectStore(name));
    await finished;
    return value;
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already finished.
    }
    throw err;
  }
}

async function safe<T, F>(run: () => Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, prefix + "\uffff");
}

// ---- Saved ids -------------------------------------------------------------
// One key per saved item: <user>:<kind>:<id>.

export function readSaved(userId: string, kind: SaveKind): Promise<Set<string> | undefined> {
  const prefix = `${userId}:${kind}:`;
  return safe(
    () =>
      inStore("saved", "readonly", async (store) => {
        const keys = await result(store.getAllKeys(prefixRange(prefix)));
        // Every key here was written as a string (<user>:<kind>:<id>).
        const ids = keys.filter((key): key is string => typeof key === "string");
        return new Set(ids.map((key) => key.slice(prefix.length)));
      }),
    undefined
  );
}

// The whole set as the server just reported it.
export function replaceSaved(userId: string, kind: SaveKind, ids: Iterable<string>): Promise<boolean> {
  const prefix = `${userId}:${kind}:`;
  return safe(
    () =>
      inStore("saved", "readwrite", async (store) => {
        await result(store.delete(prefixRange(prefix)));
        for (const id of ids) store.put(true, prefix + id);
        return true;
      }),
    false
  );
}

export function setSaved(userId: string, kind: SaveKind, id: string, saved: boolean): Promise<boolean> {
  const key = `${userId}:${kind}:${id}`;
  return safe(
    () =>
      inStore("saved", "readwrite", async (store) => {
        await result(saved ? store.put(true, key) : store.delete(key));
        return true;
      }),
    false
  );
}

// ---- Trail progress --------------------------------------------------------
// One key per trail: <user>:<route>. null is "no progress", undefined is "no
// copy to read".

export function readProgress(userId: string, routeId: string): Promise<StoredProgress | null | undefined> {
  return safe(
    () =>
      inStore("progress", "readonly", async (store) => {
        const value = await result(store.get(`${userId}:${routeId}`));
        return (value as StoredProgress | undefined) ?? null;
      }),
    undefined
  );
}

export function writeProgress(userId: string, routeId: string, value: StoredProgress | null): Promise<boolean> {
  const key = `${userId}:${routeId}`;
  return safe(
    () =>
      inStore("progress", "readwrite", async (store) => {
        await result(value ? store.put(value, key) : store.delete(key));
        return true;
      }),
    false
  );
}

// ---- Unlocked entries ------------------------------------------------------
// One key per entry: <user>:<entry>.

export function readUnlocks(userId: string, entryIds: string[]): Promise<Set<string> | undefined> {
  return safe(
    () =>
      inStore("unlocks", "readonly", async (store) => {
        const hits = await Promise.all(entryIds.map((id) => result(store.getKey(`${userId}:${id}`))));
        return new Set(entryIds.filter((_, index) => hits[index] !== undefined));
      }),
    undefined
  );
}

// What the server reported for the ids that were asked about.
export function replaceUnlocks(userId: string, asked: string[], unlocked: Set<string>): Promise<boolean> {
  return safe(
    () =>
      inStore("unlocks", "readwrite", (store) => {
        for (const id of asked) {
          if (unlocked.has(id)) store.put(true, `${userId}:${id}`);
          else store.delete(`${userId}:${id}`);
        }
        return Promise.resolve(true);
      }),
    false
  );
}

export function setUnlock(userId: string, entryId: string, unlocked: boolean): Promise<boolean> {
  const key = `${userId}:${entryId}`;
  return safe(
    () =>
      inStore("unlocks", "readwrite", async (store) => {
        await result(unlocked ? store.put(true, key) : store.delete(key));
        return true;
      }),
    false
  );
}

// ---- Queue -----------------------------------------------------------------
// The user's waiting writes are one array under <user>:ops, so folding a new
// write into them (addOp) is one read and one write in one transaction. The
// count of writes dropped by replay is <user>:dropped.

export function readQueue(userId: string): Promise<QueuedOp[] | undefined> {
  return safe(
    () =>
      inStore("queue", "readonly", async (store) => {
        return ((await result(store.get(`${userId}:ops`))) as QueuedOp[] | undefined) ?? [];
      }),
    undefined
  );
}

async function changeQueue(userId: string, change: (ops: QueuedOp[]) => QueuedOp[]): Promise<boolean> {
  const ok = await safe(async () => {
    await inStore("queue", "readwrite", async (store) => {
      const key = `${userId}:ops`;
      const ops = ((await result(store.get(key))) as QueuedOp[] | undefined) ?? [];
      const next = change(ops);
      if (next === ops) return;
      await result(next.length > 0 ? store.put(next, key) : store.delete(key));
    });
    return true;
  }, false);
  if (ok) await refreshQueueView(userId);
  return ok;
}

export function enqueueOp(userId: string, item: QueuedOp): Promise<boolean> {
  return changeQueue(userId, (ops) => addOp(ops, item));
}

export function removeQueued(userId: string, id: string): Promise<boolean> {
  return changeQueue(userId, (ops) => (ops.some((q) => q.id === id) ? ops.filter((q) => q.id !== id) : ops));
}

export function addDropped(userId: string, count: number): Promise<boolean> {
  return safe(async () => {
    await inStore("queue", "readwrite", async (store) => {
      const key = `${userId}:dropped`;
      const before = ((await result(store.get(key))) as number | undefined) ?? 0;
      await result(store.put(before + count, key));
    });
    await refreshQueueView(userId);
    return true;
  }, false);
}

export function clearDropped(userId: string): Promise<boolean> {
  return safe(async () => {
    await inStore("queue", "readwrite", (store) => result(store.delete(`${userId}:dropped`)));
    await refreshQueueView(userId);
    return true;
  }, false);
}

// ---- Clearing --------------------------------------------------------------

async function clearPrefix(name: Store, userId: string): Promise<void> {
  await inStore(name, "readwrite", (store) => result(store.delete(prefixRange(`${userId}:`))));
}

// Sign out: this user's saved ids, progress and unlocks go. Writes still
// waiting stay under the user id and replay at the next sign in.
export async function clearUserCopy(userId: string): Promise<void> {
  await safe(async () => {
    await clearPrefix("saved", userId);
    await clearPrefix("progress", userId);
    await clearPrefix("unlocks", userId);
    return true;
  }, false);
}

// Delete account: everything of this user, queue included.
export async function purgeUser(userId: string): Promise<void> {
  await clearUserCopy(userId);
  await safe(async () => {
    await clearPrefix("queue", userId);
    return true;
  }, false);
  setView(userId, EMPTY_VIEW);
}

// ---- What the screens read -------------------------------------------------
// The notice, the sign out dialog and the Offline modal show the count of
// waiting writes and of dropped ones. Kept in memory and refreshed after every
// queue change, so a screen gets one stable object until a number changes.

export interface QueueView {
  pending: number;
  dropped: number;
}

const EMPTY_VIEW: QueueView = { pending: 0, dropped: 0 };
const views = new Map<string, QueueView>();
const listeners = new Set<() => void>();

function setView(userId: string, next: QueueView): void {
  const before = views.get(userId) ?? EMPTY_VIEW;
  if (before.pending === next.pending && before.dropped === next.dropped) return;
  views.set(userId, next);
  listeners.forEach((listener) => listener());
}

export async function refreshQueueView(userId: string): Promise<void> {
  const ops = await readQueue(userId);
  const dropped = await safe(
    () => inStore("queue", "readonly", async (store) => ((await result(store.get(`${userId}:dropped`))) as number | undefined) ?? 0),
    0
  );
  setView(userId, { pending: ops?.length ?? 0, dropped });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useQueueView(userId: string | undefined): QueueView {
  useEffect(() => {
    if (userId) void refreshQueueView(userId);
  }, [userId]);
  return useSyncExternalStore(
    subscribe,
    () => (userId ? (views.get(userId) ?? EMPTY_VIEW) : EMPTY_VIEW),
    () => EMPTY_VIEW
  );
}
