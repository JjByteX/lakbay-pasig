import { useState } from "react";
import { Heart } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

/**
 * The save heart's icon and its feedback, shared by save-button.tsx and
 * save-route-button.tsx so the two cannot drift (and so every heart in the
 * app, Discover cards, Saved, place, business and trail pages, feels the
 * same). Springs and a press squish, the same motion language as the
 * onboarding tiles (category-chip-group.tsx):
 *
 *  - Every press squishes the heart under the finger (whileTap), so a tap
 *    registers before anything else happens. The motion span covers the whole
 *    36px button, not just the 20px glyph, so a tap on the padding squishes too.
 *  - A save (a signed-in tap that turns it on) pops the heart with an
 *    overshoot, sends one ring and six small dots outward from it
 *    (HeartBurst), and gives a 10ms haptic tick on devices that support it
 *    (Android; iOS Safari has no vibrate API and just skips it).
 *  - Nothing moves on page load, on un-save, or for a guest whose tap only
 *    opens the sign-in popup: saving is a frequent action, so the reward is
 *    reserved for the moment something is actually saved.
 *
 * All of it is off under reduced motion, haptic included. The burst is flat
 * (a 2px ring and solid dots in the primary color, no glow or gradient, per
 * ux-ui-guidelines.md) and short (about half a second). Its reach is 20px from
 * the heart's center, kept inside the 24px of card padding to the right of the
 * heart on the Saved and Discover cards, whose wrappers clip overflow.
 */
export function useHeartPop(saved: boolean, onPress: () => void) {
  const { session } = useAuth();
  const reduceMotion = useReducedMotion();
  const [popKey, setPopKey] = useState(0);
  function press() {
    if (session && !saved) {
      setPopKey((k) => k + 1);
      if (!reduceMotion && typeof navigator.vibrate === "function") navigator.vibrate(10);
    }
    onPress();
  }
  return { popKey, press };
}

// Six dots, evenly spaced, alternating full and softer primary so the burst
// reads as sparkle, not a ring of identical beads.
const BURST_DOTS = [0, 60, 120, 180, 240, 300];
const BURST_REACH = 20;

// One ring and six dots flying out from the heart's center and fading. Keyed by
// popKey in SaveHeart, so each save remounts it and plays it from the start.
// pointer-events-none: it sits over the button and must never eat the next tap.
function HeartBurst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <motion.span
        className="absolute h-5 w-5 rounded-full border-2 border-primary"
        initial={{ scale: 0.4, opacity: 0.7 }}
        animate={{ scale: 1.9, opacity: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
      {BURST_DOTS.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <motion.span
            key={deg}
            className={cn("absolute h-1.5 w-1.5 rounded-full", i % 2 === 0 ? "bg-primary" : "bg-primary/60")}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{ x: Math.cos(rad) * BURST_REACH, y: Math.sin(rad) * BURST_REACH, scale: 0.3, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        );
      })}
    </span>
  );
}

export function SaveHeart({ saved, popKey }: Readonly<{ saved: boolean; popKey: number }>) {
  const reduceMotion = useReducedMotion();
  const celebrate = popKey > 0 && !reduceMotion;
  return (
    <motion.span
      className="relative flex p-2"
      whileTap={reduceMotion ? undefined : { scale: 0.85 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
    >
      <motion.span
        key={popKey}
        className="flex"
        initial={celebrate ? { scale: 0.3, rotate: -18 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 10 }}
      >
        <Heart weight={saved ? "fill" : "bold"} className={cn("h-5 w-5", saved && "text-primary")} />
      </motion.span>
      {/* Own key prefix: this and the heart above are siblings, and two siblings
          with the same key (both popKey) make React keep stale copies of the
          heart on every later save, stacking hearts side by side. */}
      {celebrate && <HeartBurst key={`burst-${popKey}`} />}
    </motion.span>
  );
}
