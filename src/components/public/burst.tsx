import { motion, useReducedMotion } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";

const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * The app's "it happened" burst: one ring and eight flat dots thrown outward,
 * the heart's burst (save-heart.tsx) on a bigger stage. Place it inside a
 * `relative` box the size of the thing that just landed; it centers on that
 * box. `ring={false}` leaves only the dots, for a square mark where a round
 * ring would look wrong. Flat primary color, no glow. Renders nothing under
 * reduced motion.
 */
export function Burst({
  distance = 54,
  delay = 0.1,
  ring = true,
}: Readonly<{ distance?: number; delay?: number; ring?: boolean }>) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <>
      {ring && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-primary"
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: DURATION.moment, delay, ease: EASE_OUT }}
        />
      )}
      {ANGLES.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <motion.span
            key={angle}
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full bg-primary"
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{ x: Math.cos(rad) * distance, y: Math.sin(rad) * distance, scale: 0, opacity: 0 }}
            transition={{ duration: DURATION.moment, delay: delay + 0.02, ease: EASE_OUT }}
          />
        );
      })}
    </>
  );
}
