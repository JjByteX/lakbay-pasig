import { readMeta } from "./meta";
import { refreshTrail, runDownload } from "./download";
import { isOnline } from "./status";
import { replayQueue } from "./queue";
import { packsDue, shouldSync } from "./rules";

// Foreground sync only. Safari and iOS have no Background Sync, so it runs when
// the app opens, when the connection returns and when the tab comes back into
// view. shouldSync and packsDue keep it to once a day. Each downloaded trail
// refreshes on its own clock, so a trail downloaded alone still syncs.
// Writes made offline (Phase 8) replay at the same moments, before the pull.
export async function syncNow(): Promise<void> {
  await replayQueue();
  if (shouldSync(readMeta(), Date.now(), isOnline())) await runDownload("sync");
  // Started together, but each takes its turn in download.ts (acquire), so the
  // worker still handles one download setting at a time.
  await Promise.all(packsDue(readMeta(), Date.now(), isOnline()).map((id) => refreshTrail(id)));
}

export function startSync(): void {
  const run = () => void syncNow();
  run();
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
}
