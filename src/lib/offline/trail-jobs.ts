import { useSyncExternalStore } from "react";
import type { FailReason } from "./rules";

// What a trail download is doing right now (Phase 7), in memory. The trail page
// button and the Offline modal read it. Kept apart from download.ts so the
// button does not load the download code until it is tapped. A finished pack
// lives in meta (meta.trails), not here.
export interface TrailJob {
  status: "downloading" | "failed";
  done: number;
  total: number;
  reason: FailReason | null;
}

// Jobs are replaced, never changed, so a job object stays the same until
// something about it changes (useSyncExternalStore needs that).
const jobs = new Map<string, TrailJob>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function set(id: string, job: TrailJob | null): void {
  if (job) jobs.set(id, job);
  else jobs.delete(id);
  listeners.forEach((listener) => listener());
}

export function getTrailJob(id: string): TrailJob | null {
  return jobs.get(id) ?? null;
}

export function startTrailJob(id: string, controller: AbortController): void {
  controllers.set(id, controller);
  set(id, { status: "downloading", done: 0, total: 0, reason: null });
}

export function progressTrailJob(id: string, done: number, total: number): void {
  if (jobs.get(id)?.status === "downloading") set(id, { status: "downloading", done, total, reason: null });
}

export function failTrailJob(id: string, reason: FailReason): void {
  controllers.delete(id);
  set(id, { status: "failed", done: 0, total: 0, reason });
}

export function endTrailJob(id: string): void {
  controllers.delete(id);
  set(id, null);
}

export function cancelTrailDownload(id: string): void {
  controllers.get(id)?.abort();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTrailJob(id: string): TrailJob | null {
  return useSyncExternalStore(
    subscribe,
    () => getTrailJob(id),
    () => null
  );
}
