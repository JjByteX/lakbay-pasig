import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The app's "working" mark: a flat primary tile with a square that turns over,
 * the one onboarding's finish screen shows while it saves. Used instead of a
 * spinner so waiting looks the same everywhere (ux-ui-guidelines.md,
 * consistency). Static under reduced motion. Decorative: the text beside it
 * says what is happening.
 */
const TILE = { xs: "h-6 w-6", sm: "h-8 w-8", md: "h-12 w-12" } as const;
const INNER = { xs: "h-3 w-3", sm: "h-4 w-4", md: "h-5 w-5" } as const;

export function SquareLoader({ size = "md", className }: Readonly<{ size?: "xs" | "sm" | "md"; className?: string }>) {
  const reduceMotion = useReducedMotion();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary",
        TILE[size],
        className
      )}
    >
      <motion.span
        className={cn("block rounded-lg border-2 border-primary-foreground", INNER[size])}
        animate={reduceMotion ? undefined : { rotate: 180 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
      />
    </span>
  );
}
