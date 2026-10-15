import { readMeta, writeMeta } from "./meta";
import { startStatus } from "./status";
import { startQueue } from "./queue";
import { startSync } from "./sync";
import { isEvicted, prunePacks, withoutContent } from "./rules";

// The screens import status.ts and meta.ts directly, so the shell does not pull
// the download code (and every query file it reads) into the first page load.
// Only the Offline modal and the trail Download button (on tap) import
// download.ts.
export { useOnline, isOnline } from "./status";
export { useOfflineMeta } from "./meta";
export {
  downloadAll,
  cancelDownload,
  removeDownload,
  estimateDownloadBytes,
  isDownloading,
  downloadTrail,
  removeTrail,
} from "./download";
export { cancelTrailDownload, useTrailJob } from "./trail-jobs";
export { replayQueue } from "./queue";
export { formatSize } from "./rules";

// Runs once, after the first paint (main.tsx).
export async function initOffline(): Promise<void> {
  startStatus();
  // Own data (Phase 8): replay on sign in, clear the copy on sign out.
  startQueue();

  // A tab closed mid download leaves "downloading" behind.
  const meta = readMeta();
  if (meta.state === "downloading") writeMeta({ ...meta, state: meta.syncedAt ? "downloaded" : "idle" });

  // The browser may have cleared the cache. Then the modal goes back to Download,
  // and a downloaded trail whose cache is gone is dropped from the list.
  try {
    const names = await caches.keys();
    if (isEvicted(readMeta(), names)) writeMeta(withoutContent(readMeta()));
    const pruned = prunePacks(readMeta(), names);
    if (pruned !== readMeta()) writeMeta(pruned);
  } catch {
    // No Cache API, nothing could have been downloaded.
  }

  startSync();
}
