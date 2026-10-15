// Pure rules for the write queue (offline-phases.md, Phase 8). No imports, so
// scripts/offline-check.mjs can run this file in plain Node. The IndexedDB
// store is mine.ts, the replay that talks to Supabase is queue.ts.

export type SaveKind = "place" | "business" | "route";

// One write made while offline. All three are safe to repeat (offline-plan.md,
// Trail downloads and offline saves): a save is one insert or delete, progress
// is an upsert on (user, trail), an unlock is an upsert on (user, entry).
export type QueueOp =
  | { kind: "save"; target: SaveKind; id: string; saved: boolean }
  // `order` is the stop's sequence_order, `at` is when it happened, so the
  // replayed row keeps its own unlocked_at.
  | { kind: "progress"; routeId: string; stopId: string; order: number; at: string }
  | { kind: "unlock"; entryId: string };

export interface QueuedOp {
  id: string;
  op: QueueOp;
}

function sameTarget(a: QueueOp, b: QueueOp): boolean {
  if (a.kind === "save" && b.kind === "save") return a.target === b.target && a.id === b.id;
  if (a.kind === "progress" && b.kind === "progress") return a.routeId === b.routeId;
  if (a.kind === "unlock" && b.kind === "unlock") return a.entryId === b.entryId;
  return false;
}

// Adds a write to a user's queue, folding it into any waiting write on the
// same target:
// - save then unsave (or the other way) of the same id keeps the last one.
// - progress keeps the highest stop by sequence_order, so an earlier stop never
//   replaces a later one.
// - an unlock already waiting is enough, a second one changes nothing.
// Returns the same array when nothing changes.
export function addOp(queue: QueuedOp[], next: QueuedOp): QueuedOp[] {
  const same = queue.filter((q) => sameTarget(q.op, next.op));
  const incoming = next.op;
  if (incoming.kind === "unlock" && same.length > 0) return queue;
  if (incoming.kind === "progress") {
    const highest = same.reduce((max, q) => (q.op.kind === "progress" ? Math.max(max, q.op.order) : max), -Infinity);
    if (incoming.order < highest) return queue;
  }
  return [...queue.filter((q) => !sameTarget(q.op, next.op)), next];
}

// What a replayed write came back with. The fields are the ones Supabase puts
// on its error object.
export interface ReplayError {
  code?: string | null;
  message?: string | null;
}

// done: the server has it, take it off the queue. 23505 is a repeated save, so
//       it is done too.
// drop: the server will never take it (23503 a missing row, 42501 not allowed),
//       take it off the queue and tell the user once.
// keep: stop the run and keep this write and the rest. A lost connection is the
//       usual reason. Anything unrecognised also waits: a write is never lost
//       for a reason nobody has looked at.
export type ReplayOutcome = "done" | "drop" | "keep";

export function replayOutcome(error: ReplayError | null, network: boolean): ReplayOutcome {
  if (!error) return "done";
  if (network) return "keep";
  if (error.code === "23505") return "done";
  if (error.code === "23503" || error.code === "42501") return "drop";
  return "keep";
}

// Replay only under the account that made the write. Another account's writes
// wait until that account signs in again.
export function canReplay(owner: string, sessionUser: string | null): boolean {
  return sessionUser !== null && owner === sessionUser;
}

export interface ReplayHooks {
  send(op: QueueOp): Promise<ReplayError | null>;
  isNetwork(error: ReplayError): boolean;
  // Is the signed in account still the owner? Asked before every write, and
  // again before a drop, because a session that is gone looks like 42501.
  stillOwner(): Promise<boolean>;
  settled(item: QueuedOp, outcome: "done" | "drop"): Promise<void>;
}

// Oldest first. Stops at the first write that has to wait and leaves it and
// everything after it alone.
export async function replayOps(
  queue: QueuedOp[],
  hooks: ReplayHooks
): Promise<{ done: number; dropped: number; stopped: boolean }> {
  let done = 0;
  let dropped = 0;
  for (const item of queue) {
    if (!(await hooks.stillOwner())) return { done, dropped, stopped: true };

    let error: ReplayError | null = null;
    try {
      error = await hooks.send(item.op);
    } catch (err) {
      error = { message: String((err as { message?: unknown } | null)?.message ?? err) };
    }

    let outcome = replayOutcome(error, error ? hooks.isNetwork(error) : false);
    if (outcome === "drop" && !(await hooks.stillOwner())) outcome = "keep";
    if (outcome === "keep") return { done, dropped, stopped: true };

    await hooks.settled(item, outcome);
    if (outcome === "done") done += 1;
    else dropped += 1;
  }
  return { done, dropped, stopped: false };
}
