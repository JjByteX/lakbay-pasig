// Sets the browser tab title (document.title) for the current page.
// No page anywhere in src/ set document.title before this — the app
// shipped with index.html's static "Lakbay Pasig" on every route,
// confirmed by grep before adding this (constraints.md's Inventory
// Before Suggesting rule). No title-management dependency exists in
// package.json (react-helmet or similar), and document.title is a
// native platform feature that fully covers a static per-page string,
// so this stays a plain useEffect, no new dependency, per ponytail's
// native-platform-feature rung.
//
// Convention: "{Page} | Lakbay Pasig" everywhere except Home itself,
// which keeps the bare app name on the root route since Home is
// effectively the app's own landing identity, not a sub-page — same
// exception the request that added this named directly.
import { useEffect } from "react";

const APP_NAME = "Lakbay Pasig";

export function usePageTitle(page: string | null): void {
  useEffect(() => {
    document.title = page ? `${page} | ${APP_NAME}` : APP_NAME;
    // No cleanup/restore on unmount: the next page mounting sets its
    // own title in the same way, and React Router never leaves the
    // document titleless between routes, so there's nothing to revert
    // to. Matches how every other page-scoped effect in this codebase
    // (e.g. trail-detail.tsx's GPS-watch effect) only tears down what
    // it itself started.
  }, [page]);
}

// Ponytail's non-trivial-logic rule: this is a one-line effect, but the
// null-vs-string branch is a real branch, so it gets the smallest
// runnable check rather than none. Run with: npx tsx src/lib/page-title.ts
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) {
      throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  // Minimal effect-runner stand-in: React isn't available under plain
  // Node execution, so this calls the same title logic usePageTitle
  // wraps, not the hook itself (which needs a React render to fire).
  const setTitle = (page: string | null) => {
    document.title = page ? `${page} | ${APP_NAME}` : APP_NAME;
  };

  (globalThis as { document?: unknown }).document = { title: "" };

  setTitle("Trails");
  assertEqual((globalThis as unknown as { document: { title: string } }).document.title, "Trails | Lakbay Pasig", "page title set");

  setTitle(null);
  assertEqual((globalThis as unknown as { document: { title: string } }).document.title, "Lakbay Pasig", "home title (null)");

  console.log("page-title.ts demo: all checks passed");
}

// Same Node-only guard as preferences.ts, for the same reason: `process`
// doesn't exist in the Vite browser bundle, and this must never fire on
// import.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
