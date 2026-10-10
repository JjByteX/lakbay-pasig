import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Enter and exit animations for the Radix overlays (dialog.tsx, sheet.tsx,
 * dropdown-menu.tsx, admin-search-bar.tsx, bulk-action-bar.tsx). Those files
 * use the tailwindcss-animate class names (animate-in, animate-out, fade-in-0,
 * zoom-in-95, slide-in-from-*, slide-out-to-*, duration-*) and nothing defined
 * them, so every overlay appeared and vanished with no motion.
 *
 * This is the same class vocabulary, written here instead of installed, with
 * one difference that matters: tailwindcss-animate animates the `transform`
 * property, which replaces the `-translate-x-1/2 -translate-y-1/2` that
 * centers the dialog and the admin search panel, so they would fly in from
 * the wrong spot. This plugin animates the standalone `scale` and `translate`
 * properties instead, which stack on top of `transform` and leave the
 * centering alone. (Those two components set `origin-top-left` so the zoom
 * stays centered on the box's own middle.)
 *
 * Under reduced motion the zoom and the slide are dropped and only the fade
 * stays. Timing is the app's own: 150ms by default, EASE_OUT (lib/motion.ts).
 */
type Scale = Record<string, string>;

const overlayAnimations = plugin(({ addBase, addUtilities, matchUtilities, theme }) => {
  addBase({
    "@keyframes overlay-enter": {
      from: {
        opacity: "var(--tw-enter-opacity, 1)",
        scale: "var(--tw-enter-scale, 1)",
        translate: "var(--tw-enter-translate-x, 0) var(--tw-enter-translate-y, 0)",
      },
    },
    "@keyframes overlay-exit": {
      to: {
        opacity: "var(--tw-exit-opacity, 1)",
        scale: "var(--tw-exit-scale, 1)",
        translate: "var(--tw-exit-translate-x, 0) var(--tw-exit-translate-y, 0)",
      },
    },
    "@keyframes overlay-enter-fade": {
      from: { opacity: "var(--tw-enter-opacity, 1)" },
    },
    "@keyframes overlay-exit-fade": {
      to: { opacity: "var(--tw-exit-opacity, 1)" },
    },
  });

  addUtilities({
    ".animate-in": {
      animationName: "overlay-enter",
      animationDuration: "150ms",
      animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
      animationFillMode: "both",
      "--tw-enter-opacity": "initial",
      "--tw-enter-scale": "initial",
      "--tw-enter-translate-x": "initial",
      "--tw-enter-translate-y": "initial",
      "@media (prefers-reduced-motion: reduce)": { animationName: "overlay-enter-fade" },
    },
    ".animate-out": {
      animationName: "overlay-exit",
      animationDuration: "150ms",
      animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
      animationFillMode: "forwards",
      "--tw-exit-opacity": "initial",
      "--tw-exit-scale": "initial",
      "--tw-exit-translate-x": "initial",
      "--tw-exit-translate-y": "initial",
      "@media (prefers-reduced-motion: reduce)": { animationName: "overlay-exit-fade" },
    },
  });

  const opacity = { DEFAULT: "0", ...(theme("opacity") as unknown as Scale) };
  const scale = { DEFAULT: "0", ...(theme("scale") as unknown as Scale) };
  const translate = { DEFAULT: "100%", ...(theme("translate") as unknown as Scale) };
  const durations = Object.fromEntries(
    Object.entries(theme("transitionDuration") as unknown as Scale).filter(([key]) => key !== "DEFAULT")
  );

  matchUtilities({ "fade-in": (value: string) => ({ "--tw-enter-opacity": value }) }, { values: opacity });
  matchUtilities({ "fade-out": (value: string) => ({ "--tw-exit-opacity": value }) }, { values: opacity });
  matchUtilities({ "zoom-in": (value: string) => ({ "--tw-enter-scale": value }) }, { values: scale });
  matchUtilities({ "zoom-out": (value: string) => ({ "--tw-exit-scale": value }) }, { values: scale });

  matchUtilities(
    {
      "slide-in-from-top": (value: string) => ({ "--tw-enter-translate-y": `-${value}` }),
      "slide-in-from-bottom": (value: string) => ({ "--tw-enter-translate-y": value }),
      "slide-in-from-left": (value: string) => ({ "--tw-enter-translate-x": `-${value}` }),
      "slide-in-from-right": (value: string) => ({ "--tw-enter-translate-x": value }),
      "slide-out-to-top": (value: string) => ({ "--tw-exit-translate-y": `-${value}` }),
      "slide-out-to-bottom": (value: string) => ({ "--tw-exit-translate-y": value }),
      "slide-out-to-left": (value: string) => ({ "--tw-exit-translate-x": `-${value}` }),
      "slide-out-to-right": (value: string) => ({ "--tw-exit-translate-x": value }),
    },
    { values: translate }
  );

  // duration-200 etc. already set transition-duration; this makes the same
  // class set the animation's length too, so `duration-200` on a dialog sets both.
  matchUtilities({ duration: (value: string) => ({ animationDuration: value }) }, { values: durations });
});

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [overlayAnimations],
} satisfies Config;
