import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";

// Settings: Personalization, Phase 1. Applies the two account-level
// preferences (theme, font size) to the document. No settings screen
// yet, this file only makes the mechanism work: Phase 2-4 add the UI
// that writes to profiles.theme_preference / profiles.font_size_preference,
// this file only reads a resolved value and applies it.
//
// Root font size is the mechanism for all three steps: every Tailwind
// text size (text-xs through text-xl) is rem-based, so scaling the root
// scales all of them together, per settings-personalization-plan.md's
// Font size section. No per-page or per-component override needed.
const FONT_SIZE_PX = {
  small: 16,
  default: 18,
  large: 20,
} as const;

export type ThemePreference = "light" | "dark" | null;
export type FontSizePreference = "small" | "default" | "large" | null;

/**
 * Step 8 cleanup: settings.tsx (Phase 4.1's Select options) and admin-
 * settings.tsx each had their own byte-identical copy of these three
 * fixed font-size options -- this is the natural home for them, the same
 * file that already owns FontSizePreference itself and the FONT_SIZE_PX
 * table above that gives those three options meaning. Both pages import
 * from here now rather than each declaring its own copy.
 */
export const FONT_SIZE_LABELS: Record<Exclude<FontSizePreference, null>, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
};
export const FONT_SIZES = Object.keys(FONT_SIZE_LABELS) as Exclude<FontSizePreference, null>[];

// Null means unset. Theme null means light (today's look, no change),
// per Phase 1.2 and decision-log.md entry #7's nullable-means-unset
// choice. This is also the guest/signed-out behavior (Phase 1.4): no
// profiles row to read, so theme resolves the same way an unset row
// would.
export function applyTheme(theme: ThemePreference): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Null means default (18px), not small, since the new default is now
// the baseline per Phase 1.2 (the plan's instruction to bump today's
// look up a step). This also covers guest/signed-out (Phase 1.4).
export function applyFontSize(size: FontSizePreference): void {
  document.documentElement.style.fontSize = `${FONT_SIZE_PX[size ?? "default"]}px`;
}

/**
 * Step 8 cleanup: settings.tsx's own module-scope handleDarkModeChange
 * (pulled to module scope there for the Cognitive Complexity reason
 * that file's comment explains -- so its branches count toward this
 * function's own complexity, not the component's) and admin-settings.tsx's
 * inline-closure version of the exact same optimistic-write-then-persist
 * logic were byte-identical apart from the ctx plumbing. This is that
 * same shape, now the one copy both pages call: apply immediately for
 * instant feedback, write, revert both the control and the applied class
 * on failure, refreshProfile() on success. No separate Save button, per
 * the Automation First rule.
 *
 * ctx.session may be null (settings.tsx renders for a signed-out guest
 * and guards on it here) or always-present (admin-settings.tsx, behind
 * ProtectedRoute requireStaff) -- this function guards on it either way
 * rather than assuming, so it covers both callers' own preconditions
 * without either needing a separate check before calling in.
 *
 * supabase is imported dynamically inside the function body, not as a
 * static top-of-file import, so this module stays free of any import-
 * time side effect: supabase.ts throws at import time if the Vite-only
 * `import.meta.env` vars it reads aren't set (its own file comment), which
 * only ever happens inside the Vite browser bundle, never under the
 * plain Node `npx tsx src/lib/preferences.ts` this file's own demo()
 * comment documents as the supported way to run its self-check. A static
 * import would break that standalone run the moment this function was
 * added; this keeps it working exactly as before.
 */
export async function handleDarkModeChange(
  checked: boolean,
  ctx: {
    session: Session | null;
    themeSaving: boolean;
    darkMode: boolean;
    setDarkMode: Dispatch<SetStateAction<boolean>>;
    setThemeError: Dispatch<SetStateAction<string | null>>;
    setThemeSaving: Dispatch<SetStateAction<boolean>>;
    refreshProfile: () => Promise<void>;
  }
): Promise<void> {
  const { session, themeSaving, darkMode, setDarkMode, setThemeError, setThemeSaving, refreshProfile } = ctx;
  if (!session || themeSaving) return;

  const previous = darkMode;
  const nextTheme = checked ? "dark" : "light";

  setDarkMode(checked);
  setThemeError(null);
  applyTheme(nextTheme);
  setThemeSaving(true);

  const { supabase } = await import("./supabase");
  const { error } = await supabase
    .from("profiles")
    .update({ theme_preference: nextTheme })
    .eq("id", session.user.id);

  setThemeSaving(false);

  if (error) {
    setDarkMode(previous);
    applyTheme(previous ? "dark" : "light");
    setThemeError(error.message);
    return;
  }

  await refreshProfile();
}

// Same optimistic-then-persist shape as handleDarkModeChange above.
// applyFontSize fires immediately, then the write; on failure, revert
// both the selection and the applied size, show the same inline
// text-destructive error line. Same shared-between-both-pages reasoning
// as handleDarkModeChange's own comment, including the dynamic supabase
// import for the same demo()-must-keep-working reason.
export async function handleFontSizeChange(
  next: Exclude<FontSizePreference, null>,
  ctx: {
    session: Session | null;
    fontSizeSaving: boolean;
    fontSize: Exclude<FontSizePreference, null>;
    setFontSize: Dispatch<SetStateAction<Exclude<FontSizePreference, null>>>;
    setFontSizeError: Dispatch<SetStateAction<string | null>>;
    setFontSizeSaving: Dispatch<SetStateAction<boolean>>;
    refreshProfile: () => Promise<void>;
  }
): Promise<void> {
  const { session, fontSizeSaving, fontSize, setFontSize, setFontSizeError, setFontSizeSaving, refreshProfile } =
    ctx;
  if (!session || fontSizeSaving) return;

  const previous = fontSize;

  setFontSize(next);
  setFontSizeError(null);
  applyFontSize(next);
  setFontSizeSaving(true);

  const { supabase } = await import("./supabase");
  const { error } = await supabase
    .from("profiles")
    .update({ font_size_preference: next })
    .eq("id", session.user.id);

  setFontSizeSaving(false);

  if (error) {
    setFontSize(previous);
    applyFontSize(previous);
    setFontSizeError(error.message);
    return;
  }

  await refreshProfile();
}

// Phase 1.5: ponytail's non-trivial-logic rule, smallest runnable check,
// no test framework, no jsdom dependency. Run standalone in Node with:
// npx tsx src/lib/preferences.ts (patches a minimal document stand-in,
// since Node has no DOM, then exercises the same two functions above
// unmodified).
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) {
      throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  const classes = new Set<string>();
  const style = { fontSize: "" };
  (globalThis as { document?: unknown }).document = {
    documentElement: {
      classList: { toggle: (cls: string, on: boolean) => (on ? classes.add(cls) : classes.delete(cls)) },
      style,
    },
  };

  applyTheme("dark");
  assertEqual(classes.has("dark"), true, "applyTheme('dark')");

  applyTheme("light");
  assertEqual(classes.has("dark"), false, "applyTheme('light')");

  applyTheme("dark");
  applyTheme(null);
  assertEqual(classes.has("dark"), false, "applyTheme(null)");

  applyFontSize("small");
  assertEqual(style.fontSize, "16px", "applyFontSize('small')");

  applyFontSize("default");
  assertEqual(style.fontSize, "18px", "applyFontSize('default')");

  applyFontSize("large");
  assertEqual(style.fontSize, "20px", "applyFontSize('large')");

  applyFontSize(null);
  assertEqual(style.fontSize, "18px", "applyFontSize(null)");

  console.log("preferences.ts demo: all checks passed");
}

// Only run when this file is executed directly (npx tsx src/lib/preferences.ts),
// never on import, so the app importing applyTheme/applyFontSize elsewhere
// never triggers this and never touches the real document. `process` is a
// Node global that does not exist in the Vite browser bundle -- the
// `typeof process !== "undefined"` guard short-circuits before touching
// `.argv` there, so this whole check is a no-op (and harmless) in the app,
// only ever true under direct Node execution.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
