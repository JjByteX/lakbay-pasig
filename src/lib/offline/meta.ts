import { useSyncExternalStore } from "react";
import { EMPTY_META, type OfflineMeta } from "./rules";

// Device level state, kept in localStorage (approved in offline-plan.md:
// Guests have no profile row, so this cannot live in profiles). Every read and
// write is in try/catch: storage can be missing or full, and then the app
// behaves as if nothing was downloaded.
const KEY = "lakbay-offline";

function load(): OfflineMeta {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY_META, ...JSON.parse(raw) } : EMPTY_META;
  } catch {
    return EMPTY_META;
  }
}

// useSyncExternalStore needs the same object back until something changes.
let snapshot: OfflineMeta = load();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function readMeta(): OfflineMeta {
  return snapshot;
}

export function writeMeta(next: OfflineMeta): void {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable. The state still holds for this session.
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Another tab changed it.
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  snapshot = load();
  notify();
});

export function useOfflineMeta(): OfflineMeta {
  return useSyncExternalStore(subscribe, readMeta, readMeta);
}
