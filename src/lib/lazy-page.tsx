import { lazy, Suspense, type ComponentType, type ReactElement } from "react";

/**
 * Route pages loaded on first visit instead of with the first screen, so a
 * guest opening Home does not download the admin and vendor screens.
 *
 * The Suspense sits inside the page, not around the whole app, so the shell
 * (header, nav, sidebar) stays put while a page's file arrives. Fallback is
 * empty on purpose: preloadPages below fetches these files while the browser
 * is idle, so the wait is rare, and a flash of a loader would be worse.
 */

const RELOAD_FLAG = "lakbay-chunk-reload";

// After a new deploy, a tab that was already open asks for a file name that no
// longer exists. Reload once to pick up the new build. The flag stops a loop if
// the failure is something else (offline, blocked).
function loadPage<P>(loader: () => Promise<{ default: ComponentType<P> }>) {
  return loader()
    .then((module) => {
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* storage blocked, nothing to clear */
      }
      return module;
    })
    .catch((error: unknown) => {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          window.location.reload();
          return new Promise<never>(() => {});
        }
      } catch {
        /* storage blocked, fall through to the error */
      }
      throw error;
    });
}

export interface LazyPage {
  (): ReactElement;
  preload: () => Promise<unknown>;
}

export function lazyPage(loader: () => Promise<{ default: ComponentType }>): LazyPage {
  const Inner = lazy(() => loadPage(loader));
  const Page = (() => (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )) as LazyPage;
  // A failed preload is silent: the real visit retries and handles the error.
  Page.preload = () => loader().catch(() => undefined);
  return Page;
}

interface SaveDataConnection {
  connection?: { saveData?: boolean };
}

/** Runs `task` when the browser is idle. Returns a function that cancels it. */
export function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 2000);
  return () => window.clearTimeout(id);
}

/** Fetches page files ahead of the visit, one at a time, unless Data Saver is on. */
export async function preloadPages(pages: readonly LazyPage[]): Promise<void> {
  if ((navigator as Navigator & SaveDataConnection).connection?.saveData) return;
  await pages.reduce<Promise<unknown>>((chain, page) => chain.then(() => page.preload()), Promise.resolve());
}
