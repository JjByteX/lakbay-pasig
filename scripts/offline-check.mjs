// Smallest check for src/lib/offline/rules.ts and queue-rules.ts. Run: node scripts/offline-check.mjs
// (Node 22.18+ reads the .ts file directly.) Fails with an assert if a sync rule
// breaks, or if a detail page drifts from the reads that Download repeats
// (src/lib/offline/reads.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_META,
  PAGE_CONTRACTS,
  RETRY_GAP_MS,
  SYNC_INTERVAL_MS,
  afterPackGone,
  afterPackSync,
  afterSync,
  contentCacheName,
  estimateBytes,
  estimateTrailBytes,
  failReason,
  formatSize,
  isCacheOfTrail,
  isEvicted,
  packsDue,
  prunePacks,
  savedAt,
  shouldSync,
  trailCacheName,
  withoutContent,
  withoutPack,
} from "../src/lib/offline/rules.ts";
import { addOp, canReplay, replayOps, replayOutcome } from "../src/lib/offline/queue-rules.ts";

const now = 10 * SYNC_INTERVAL_MS;
const downloaded = { ...EMPTY_META, state: "downloaded", syncedAt: now - SYNC_INTERVAL_MS - 1, cache: "content-1" };

// Sync runs once a day, online, and only after a download.
assert.equal(shouldSync(downloaded, now, true), true, "due after a day");
assert.equal(shouldSync(downloaded, now, false), false, "not offline");
assert.equal(shouldSync(EMPTY_META, now, true), false, "not before a download");
assert.equal(shouldSync({ ...downloaded, syncedAt: now - 1000 }, now, true), false, "not twice in a day");
assert.equal(shouldSync({ ...downloaded, attemptedAt: now - RETRY_GAP_MS + 1 }, now, true), false, "retry gap");
assert.equal(shouldSync({ ...downloaded, attemptedAt: now - RETRY_GAP_MS }, now, true), true, "retry after the gap");

// A good sync swaps cache and time. A failed one keeps the old data and time.
const good = afterSync(downloaded, { cache: "content-2" }, now);
assert.equal(good.cache, "content-2");
assert.equal(good.syncedAt, now);
const bad = afterSync(downloaded, null, now);
assert.equal(bad.cache, "content-1");
assert.equal(bad.syncedAt, downloaded.syncedAt);
assert.equal(bad.attemptedAt, now);
assert.equal(bad.state, "downloaded");

// Eviction.
assert.equal(isEvicted(downloaded, ["shell-abc"]), true, "downloaded but no content cache");
assert.equal(isEvicted(downloaded, ["shell-abc", "content-1"]), false);
assert.equal(isEvicted(EMPTY_META, []), false, "nothing to evict");
assert.match(contentCacheName(5), /^content-5$/);

// Failure reasons.
assert.equal(failReason(new TypeError("Failed to fetch")), "network");
assert.equal(failReason({ message: "TypeError: Failed to fetch" }), "network");
assert.equal(failReason(Object.assign(new Error("x"), { name: "QuotaExceededError" })), "storage_full");
assert.equal(failReason(Object.assign(new Error("x"), { name: "UnsupportedError" })), "unsupported");
assert.equal(failReason(new Error("boom")), "unknown");

// Size text.
assert.equal(formatSize(500000), "under 1 MB");
assert.equal(formatSize(3 * 1048576), "about 3 MB");
assert.equal(formatSize(43 * 1048576), "about 45 MB");
assert.ok(estimateBytes({ places: 100, businesses: 100, events: 10, trails: 5, covers: 200 }) > 0);

// Trail packs (Phase 7). A download adds a pack, a good sync replaces it, a
// failed sync keeps the old one and only moves the attempt time.
assert.equal(trailCacheName("t1", 5), "trail-t1-5");
assert.equal(isCacheOfTrail("trail-t1-5", "t1"), true);
assert.equal(isCacheOfTrail("trail-t10-5", "t1"), false, "another trail's cache");
const first = afterPackSync(EMPTY_META, "t1", { name: "Old Town", cache: "trail-t1-5", bytes: 1000 }, now - SYNC_INTERVAL_MS - 1);
assert.equal(first.trails.length, 1);
assert.equal(first.state, "idle", "a pack does not mark the Pasig download as done");
const refreshed = afterPackSync(first, "t1", { name: "Old Town", cache: "trail-t1-9", bytes: 2000 }, now);
assert.equal(refreshed.trails.length, 1, "replaced, not added twice");
assert.equal(refreshed.trails[0].cache, "trail-t1-9");
const failedPack = afterPackSync(first, "t1", null, now);
assert.equal(failedPack.trails[0].cache, "trail-t1-5", "failure keeps the old pack");
assert.equal(failedPack.trails[0].syncedAt, first.trails[0].syncedAt, "failure keeps the old time");
assert.equal(failedPack.trails[0].attemptedAt, now);

// Which packs sync: a day old, online, outside the retry gap.
assert.deepEqual(packsDue(first, now, true), ["t1"]);
assert.deepEqual(packsDue(first, now, false), [], "not offline");
assert.deepEqual(packsDue(refreshed, now, true), [], "fresh");
assert.deepEqual(packsDue(failedPack, now, true), [], "retry gap");

// A trail that is gone leaves the list and its name is kept once for the modal.
const gone = afterPackGone(first, "t1");
assert.equal(gone.trails.length, 0);
assert.deepEqual(gone.gone, ["Old Town"]);
assert.equal(afterPackGone(EMPTY_META, "t1"), EMPTY_META, "nothing to drop");
assert.equal(withoutPack(first, "t1").trails.length, 0);

// Removing the Pasig download keeps the trails. Eviction of one cache drops that pack only.
assert.equal(withoutContent({ ...downloaded, trails: first.trails }).trails.length, 1);
assert.equal(withoutContent({ ...downloaded, trails: first.trails }).state, "idle");
assert.equal(prunePacks(first, ["trail-t1-5"]), first, "unchanged returns the same object");
assert.equal(prunePacks(first, ["shell-abc"]).trails.length, 0, "cache cleared by the browser");

// The notice time: the Pasig download, else the newest trail.
assert.equal(savedAt(downloaded), downloaded.syncedAt);
assert.equal(savedAt(first), first.trails[0].syncedAt);
assert.equal(savedAt(EMPTY_META), null);
assert.ok(estimateTrailBytes({ stops: 5, entryPhotos: 3 }) > estimateTrailBytes({ stops: 1, entryPhotos: 0 }));

// Detail pages still make the reads that Download repeats.
for (const { file, snippets } of PAGE_CONTRACTS) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  for (const snippet of snippets) {
    assert.ok(text.includes(snippet), `${file} no longer contains ${snippet}. Update src/lib/offline/reads.ts and rules.ts.`);
  }
}

// ---- Write queue (Phase 8) ----
const save = (id, saved, target = "place") => ({ kind: "save", target, id, saved });
const stop = (routeId, stopId, order) => ({ kind: "progress", routeId, stopId, order, at: "2026-01-01T00:00:00Z" });
const item = (id, op) => ({ id, op });

// Save then unsave of the same id collapse to the last one. Other targets stay.
let queue = addOp([], item("a", save("p1", true)));
queue = addOp(queue, item("b", save("p2", true)));
queue = addOp(queue, item("c", save("p1", false)));
assert.deepEqual(queue.map((q) => q.id), ["b", "c"], "save then unsave keeps the last");
assert.equal(queue[1].op.saved, false);
queue = addOp(queue, item("d", save("p2", true, "business")));
assert.equal(queue.length, 3, "a business with the same id is another target");

// Progress keeps the highest stop by sequence_order.
let walk = addOp([], item("a", stop("r1", "s1", 1)));
walk = addOp(walk, item("b", stop("r1", "s3", 3)));
assert.deepEqual(walk.map((q) => q.op.stopId), ["s3"], "a later stop replaces an earlier one");
const unchanged = addOp(walk, item("c", stop("r1", "s2", 2)));
assert.equal(unchanged, walk, "an earlier stop never replaces a later one, same array back");
walk = addOp(walk, item("d", stop("r2", "s9", 1)));
assert.equal(walk.length, 2, "another trail has its own progress");

// An unlock already waiting is enough.
const unlocks = addOp([], item("a", { kind: "unlock", entryId: "e1" }));
assert.equal(addOp(unlocks, item("b", { kind: "unlock", entryId: "e1" })), unlocks);
assert.equal(addOp(unlocks, item("b", { kind: "unlock", entryId: "e2" })).length, 2);

// Replay outcomes: done, drop, keep.
assert.equal(replayOutcome(null, false), "done");
assert.equal(replayOutcome({ code: "23505" }, false), "done", "a repeated save is done");
assert.equal(replayOutcome({ code: "23503" }, false), "drop", "a missing row is dropped");
assert.equal(replayOutcome({ code: "42501" }, false), "drop", "not allowed is dropped");
assert.equal(replayOutcome({ message: "TypeError: Failed to fetch", code: "" }, true), "keep", "a lost connection waits");
assert.equal(replayOutcome({ code: "42501" }, true), "keep", "network wins over the code");
assert.equal(replayOutcome({ code: "PGRST301" }, false), "keep", "an unrecognised error waits");

// User binding: only the account that made the writes replays them.
assert.equal(canReplay("u1", "u1"), true);
assert.equal(canReplay("u1", "u2"), false, "another account waits");
assert.equal(canReplay("u1", null), false, "signed out waits");

// A run, oldest first. The hooks record what happened.
const isNetwork = (e) => /failed to fetch/i.test(e.message ?? "");
function harness(answers, owner = () => true) {
  const sent = [];
  const settled = [];
  return {
    sent,
    settled,
    hooks: {
      send: async (op) => {
        sent.push(op);
        const answer = answers[sent.length - 1];
        if (answer instanceof Error) throw answer;
        return answer ?? null;
      },
      isNetwork,
      stillOwner: async () => owner(sent.length),
      settled: async (q, outcome) => void settled.push([q.id, outcome]),
    },
  };
}
const three = [item("1", save("p1", true)), item("2", save("p2", true)), item("3", save("p3", true))];

let h = harness([null, null, null]);
let out = await replayOps(three, h.hooks);
assert.deepEqual(h.settled, [["1", "done"], ["2", "done"], ["3", "done"]], "all done, oldest first");
assert.deepEqual(out, { done: 3, dropped: 0, stopped: false });

h = harness([null, { message: "TypeError: Failed to fetch", code: "" }]);
out = await replayOps(three, h.hooks);
assert.deepEqual(h.settled, [["1", "done"]], "a network error keeps the failed one and the rest");
assert.equal(h.sent.length, 2, "nothing is sent after the stop");
assert.equal(out.stopped, true);

h = harness([{ code: "23505" }, { code: "42501" }, null]);
out = await replayOps(three, h.hooks);
assert.deepEqual(h.settled, [["1", "done"], ["2", "drop"], ["3", "done"]], "23505 is done, 42501 is dropped, the run goes on");
assert.deepEqual(out, { done: 2, dropped: 1, stopped: false });

h = harness([null, null, null], (sentSoFar) => sentSoFar < 1);
out = await replayOps(three, h.hooks);
assert.equal(h.sent.length, 1, "the account changed, so nothing more is sent");
assert.deepEqual(h.settled, [["1", "done"]]);
assert.equal(out.stopped, true);

// A session that is gone looks like 42501. It must wait, not be dropped.
h = harness([{ code: "42501" }], (sentSoFar) => sentSoFar < 1);
out = await replayOps(three, h.hooks);
assert.deepEqual(h.settled, [], "not dropped when the owner is no longer signed in");
assert.equal(out.stopped, true);

// A request that throws is treated as its message.
h = harness([new Error("Failed to fetch")]);
out = await replayOps(three, h.hooks);
assert.deepEqual(h.settled, []);
assert.equal(out.stopped, true);

console.log("offline-check: ok");
