import { useState, type ReactNode } from "react";
import { motion } from "motion/react";

/**
 * Landing motifs. Each one borrows a technique from a Pixel Point case study
 * and ties it to Pasig. All are decorative (aria-hidden) and honor reduced
 * motion through the MotionConfig that landing.tsx wraps the page in.
 *
 *   Neon        bold type, colorful collage instead of techie line art, and
 *               glitchy animation          -> GlitchWord, ShapeCollage
 *   Databricks  a hero that plays the whole journey from start to finish
 *                                          -> RiverJourney
 *   Unkey       generated ASCII imagery and restrained, purposeful motion
 *                                          -> AsciiRiver
 *
 * Colors are the Pasig City brand tokens from index.css (blue, red, brick),
 * via the existing semantic tokens where one exists.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

// The glitch splits the word into the two Pasig brand colors, red and blue,
// for half a second. It plays once shortly after load, then on hover.
const GLITCH_SHADOWS = [
  "0px 0 0 transparent, 0px 0 0 transparent",
  "3px 0 0 #DD0000, -3px 0 0 #1175BE",
  "-2px 0 0 #DD0000, 2px 0 0 #1175BE",
  "2px 0 0 #DD0000, -2px 0 0 #1175BE",
  "0px 0 0 transparent, 0px 0 0 transparent",
];

export function GlitchWord({ children }: Readonly<{ children: ReactNode }>) {
  const [played, setPlayed] = useState(false);
  return (
    <motion.span
      className="inline-block cursor-default"
      animate={{ x: [0, -4, 3, -2, 0], textShadow: GLITCH_SHADOWS }}
      transition={{ duration: 0.5, times: [0, 0.25, 0.5, 0.75, 1], delay: played ? 0 : 1.1 }}
      onAnimationComplete={() => setPlayed(true)}
      whileHover={{ x: [0, -4, 3, -2, 0], textShadow: GLITCH_SHADOWS, transition: { duration: 0.5 } }}
    >
      {children}
    </motion.span>
  );
}

// A row of flat geometric shapes that rise from behind the top edge of the
// element it sits on (the hero carousel). Collage, not illustration: plain
// circles, arches and quarter circles in the Pasig brand colors. The parent
// must be `relative` and put its content above this with z-10.
const SHAPES = [
  "h-14 w-14 rounded-full bg-primary",
  "h-16 w-10 rounded-t-full bg-[#A24C43]",
  "h-14 w-14 rounded-tl-full bg-destructive",
  "h-10 w-20 rounded-t-full bg-secondary",
] as const;

export function ShapeCollage() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute bottom-full right-4 z-0 flex items-end gap-2 sm:right-10">
      {SHAPES.map((shape, i) => (
        <motion.div
          key={shape}
          className={shape}
          initial={{ y: "100%" }}
          animate={{ y: "0%" }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.7 + i * 0.1 }}
        />
      ))}
    </div>
  );
}

// The Pasig River drawn as one line that runs across the process steps, with
// a stop lighting up over each step in order, so the section plays the whole
// journey as it scrolls in. Desktop only (the steps stack on smaller screens).
// The path is M0 32 then quadratic waves, so the four stops sit on its crests
// and troughs at x = 125, 375, 625 and 875 of 1000, the centers of four equal
// columns, at y = 16, 48, 16 and 48 of 64.
const STOP_POSITIONS = [
  { left: "12.5%", top: "25%" },
  { left: "37.5%", top: "75%" },
  { left: "62.5%", top: "25%" },
  { left: "87.5%", top: "75%" },
] as const;

export function RiverJourney() {
  return (
    <div aria-hidden="true" className="relative hidden h-16 lg:block">
      <svg viewBox="0 0 1000 64" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <motion.path
          d="M0 32 Q125 0 250 32 T500 32 T750 32 T1000 32"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
        />
      </svg>
      {STOP_POSITIONS.map((pos, i) => (
        <motion.span
          key={pos.left}
          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-background"
          style={pos}
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.25 + i * 0.4 }}
        />
      ))}
    </div>
  );
}

// ASCII waves drifting in opposite directions, with PASIG set into the
// current. Two rows, each the same unit twice so a 50% slide loops without a
// seam, faded at both edges.
const WAVE_UNIT = "~≈~~≈≈~~≈~   PASIG   ≈~~≈~~≈≈~   ";
const WAVE_ROW = WAVE_UNIT.repeat(8);

export function AsciiRiver() {
  return (
    <div
      aria-hidden="true"
      className="select-none overflow-hidden font-mono text-sm leading-6 text-muted-foreground/50"
      style={{ maskImage: "linear-gradient(90deg, transparent, black 15%, black 85%, transparent)" }}
    >
      {[0, 1].map((row) => (
        <motion.div
          key={row}
          className="flex w-max whitespace-pre"
          initial={{ x: row === 0 ? "0%" : "-50%" }}
          animate={{ x: row === 0 ? "-50%" : "0%" }}
          transition={{ duration: 60, ease: "linear", repeat: Infinity }}
        >
          <span>{WAVE_ROW}</span>
          <span>{WAVE_ROW}</span>
        </motion.div>
      ))}
    </div>
  );
}
