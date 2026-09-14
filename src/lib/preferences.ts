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
