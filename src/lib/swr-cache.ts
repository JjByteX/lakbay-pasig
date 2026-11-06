import { useEffect, useState } from "react";

/**
 * Stale-while-revalidate cache for public read queries, so going back to a
 * page shows what it showed last time at once and refreshes in the background,
 * instead of a skeleton and a fresh round trip on every visit.
 *
 * In memory only: a reload starts empty, and nothing is written to disk. Keys
 * must carry the signed-in user id (or "guest"), so one person's rows are never
 * handed to the next person on the same device. Use it for reads, never for
 * anything a page writes.
 */

// Inside this window a visit reuses the cached rows with no request at all.
// After it, the cached rows show first and a request refreshes them.
const FRESH_MS = 30_000;

interface Entry {
  data: unknown;
  at: number;
}

const store = new Map<string, Entry>();
// One request per key at a time, so two components (or StrictMode's second
// effect run) asking for the same thing share a single round trip.
const inflight = new Map<string, Promise<unknown>>();

function load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const request = fetcher()
    .then((data) => {
      store.set(key, { data, at: Date.now() });
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

export interface SwrState<T> {
  data: T | undefined;
  /** True only while there is nothing to show yet. A background refresh is not loading. */
  loading: boolean;
  /** True only when the request failed and there is no earlier copy to show. */
  error: boolean;
}

function initial<T>(key: string): SwrState<T> {
  const hit = store.get(key);
  return hit ? { data: hit.data as T, loading: false, error: false } : { data: undefined, loading: true, error: false };
}

// The state is stored with the key that produced it. When the key changes
// (sign in, sign out, another user), the first render must not hand back the
// previous key's rows, so useSwr returns a stored state only if its key is the
// current one and otherwise the cache's answer for the current key.
interface Held<T> extends SwrState<T> {
  key: string;
}

function held<T>(key: string, state: SwrState<T>): Held<T> {
  return { key, ...state };
}

/**
 * `retry` is a counter the page bumps from its Retry button. The fetcher must
 * be a stable function (a module-level one), not an inline arrow.
 */
export function useSwr<T>(key: string, fetcher: () => Promise<T>, retry = 0): SwrState<T> {
  const [current, setCurrent] = useState<Held<T>>(() => held(key, initial<T>(key)));

  useEffect(() => {
    let live = true;
    const hit = store.get(key);
    if (hit) {
      // Keep the same object when nothing changed, so a cache hit that already
      // matches what is on screen does not cost an extra render.
      setCurrent((prev) =>
        prev.key === key && prev.data === hit.data && !prev.loading && !prev.error
          ? prev
          : held(key, { data: hit.data as T, loading: false, error: false })
      );
      if (Date.now() - hit.at < FRESH_MS) return;
    } else {
      setCurrent((prev) =>
        prev.key === key && prev.loading && prev.data === undefined ? prev : held<T>(key, { data: undefined, loading: true, error: false })
      );
    }
    load(key, fetcher)
      .then((data) => {
        if (live) setCurrent(held(key, { data, loading: false, error: false }));
      })
      .catch(() => {
        // A failed refresh keeps the copy already on screen.
        if (live) {
          setCurrent((prev) =>
            prev.key === key && prev.data !== undefined
              ? { ...prev, loading: false }
              : held<T>(key, { data: undefined, loading: false, error: true })
          );
        }
      });
    return () => {
      live = false;
    };
  }, [key, fetcher, retry]);

  return current.key === key ? current : initial<T>(key);
}
