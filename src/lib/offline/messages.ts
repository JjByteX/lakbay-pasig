import { formatDateTimeNoSeconds } from "../datetime";
import type { FailReason } from "./rules";

// Every offline string in one place (offline-phases.md, Phase 5.2). The Help
// copy must match these word for word.
export const OFFLINE_LABEL = "Offline";
export const NEEDS_CONNECTION = "Needs a connection.";
export const MAP_NEEDS_CONNECTION = "Map needs a connection.";
export const PAGE_NOT_DOWNLOADED = "This page was not downloaded. Connect to load it.";

export function noticeText(syncedAt: number | null): string {
  if (syncedAt === null) return "Offline. Connect to load content.";
  return `Offline. Showing content saved ${formatDateTimeNoSeconds(new Date(syncedAt))}. Some listings may be outdated.`;
}

export const FAIL_TEXT: Record<FailReason, string> = {
  network: "The connection dropped. Check it and try again.",
  storage_full: "Not enough space on this device. Free some space and try again.",
  unsupported: "This browser cannot keep content offline. Open the app in a current Chrome or Safari.",
  unknown: "Something went wrong. Try again.",
  // A trail download of a trail that is no longer published, and the line the
  // modal shows for a downloaded trail a sync found removed.
  gone: "This trail is no longer available.",
};

function changes(n: number): string {
  return n === 1 ? "1 change" : `${n} changes`;
}

// Writes waiting in the queue (Phase 8). The notice, the sign out dialog and
// the Offline modal each use one of these.
export function queuedText(n: number): string {
  return `${changes(n)} will sync when you're back online.`;
}

export function signOutQueuedText(n: number): string {
  return `${changes(n)} will sync next time you sign in.`;
}

export function droppedText(n: number): string {
  return `${changes(n)} could not be saved and ${n === 1 ? "was" : "were"} removed.`;
}
