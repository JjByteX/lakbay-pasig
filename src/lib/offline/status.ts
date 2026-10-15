import { useSyncExternalStore } from "react";

// Online state. The browser's online and offline events are one signal. The
// other is the worker: it tells the page when a Supabase request failed or
// succeeded, so a bad connection counts as offline even when the browser
// still says online.
let online = navigator.onLine;
let started = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (next === online) return;
  online = next;
  listeners.forEach((listener) => listener());
}

export function startStatus(): void {
  if (started) return;
  started = true;
  window.addEventListener("online", () => set(true));
  window.addEventListener("offline", () => set(false));
  navigator.serviceWorker?.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.type === "net-fail") set(false);
    else if (e.data?.type === "net-ok") set(true);
  });
}

export function isOnline(): boolean {
  return online;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}
