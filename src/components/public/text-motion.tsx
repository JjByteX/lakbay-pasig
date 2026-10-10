import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Two small text motions lifted from onboarding (auth/categories-onboarding.tsx)
 * so the rest of the app can say the same thing the same way.
 */

// A title that rises into place word by word from behind a mask. Same spring
// and 60ms stagger as onboarding's Words. Under reduced motion it is plain text.
export function RevealWords({ text, delay = 0.05 }: Readonly<{ text: string; delay?: number }>) {
  const reduceMotion = useReducedMotion();
  return (
    <>
      {text.split(" ").map((word, i) => (
        <span key={`${word}-${i}`} className="mr-[0.25em] inline-block overflow-hidden pb-1 align-bottom">
          <motion.span
            className="inline-block"
            initial={reduceMotion ? false : { y: "110%", rotate: 4 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22, delay: delay + i * 0.06 }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </>
  );
}

// Text that rolls up when it changes: the old line leaves upward, the new one
// rises in. Onboarding's selection counter, for a label. Nothing plays on the
// first render, only on a change.
export function RollingText({ text }: Readonly<{ text: string }>) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
