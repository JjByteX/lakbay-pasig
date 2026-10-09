import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Lock, CheckCircle, QrCode } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { DURATION, EASE_OUT, SPRING_POP, SPRING_SETTLE, haptic } from "@/lib/motion";
import type { TrailStop as TrailStopData } from "@/lib/trail-types";
import { VideoEmbed } from "./video-embed";

/**
 * Step 7, Phase 4.1: one stop's render across its three states, branching
 * inside one component per the plan doc's explicit instruction ("No
 * separate locked/unlocked components, one component branching on state,
 * the content difference is the only thing that changes"):
 *
 * - locked: name only, no Discovery content, no way to force it open
 *   (that "no way to force open" rule belongs to Phase 4.6, this component
 *   only renders the state it's given, it does not decide when a stop is
 *   locked)
 * - unlocked: every Discovery content entry shown (title + content body),
 *   except an entry marked "Unlock by QR scan", which shows one line asking
 *   for the scan until the visitor has scanned its code
 * - completed: same as unlocked, visually marked done
 *
 * Sequence marker (numbered circle) and row layout reuse trail-detail.tsx's
 * existing Phase 3.3 `<li>` shape exactly (numbered ol, circle-with-number,
 * name on one line) rather than inventing a new row shape, per
 * constraints.md's Inventory Before Suggesting rule; Phase 4.3 is what
 * swaps trail-detail.tsx's plain `<li>` for this component, out of scope
 * here.
 *
 * Icons: Lock and CheckCircle from @phosphor-icons/react (already a project
 * dependency, no new install), both universally recognized concepts per
 * ux-ui-guidelines.md's icon rules ("locked", "done") so no separate text
 * label is required alongside them, matching how bottom-nav.tsx pairs
 * icon-only universal concepts. Completed state uses the same accent
 * green implied by CheckCircle's fill weight below rather than inventing
 * a new status color; locked uses text-muted-foreground, matching every
 * other "inactive/inert" treatment already in this codebase (e.g.
 * discover-list.tsx's empty-state copy).
 *
 * Motion (lib/motion.ts), for the two moments that deserve it, and only
 * when they actually happen, never on page load:
 *
 * - A stop opening. When a stop goes from locked to unlocked while the page
 *   is live (Start, or walking into range), the number tile fills with the
 *   primary color and its number pops (the heart's pop spring), the lock
 *   fades out, the content opens downward, and a 10ms haptic ticks. The row
 *   scrolls into view if it was off screen. A stop that opens only because
 *   the visitor's saved progress just loaded stays still: `progressLive`
 *   must already be true on the render before the flip.
 * - An entry just unlocked by a scan. Arriving from the scan page, the
 *   entry (`celebrateEntryId`) fades up into place and its row scrolls to the
 *   middle of the screen, once.
 *
 * All of it is off under reduced motion. Flat color and movement only: no
 * glow, no gradient (ux-ui-guidelines.md).
 */
export type TrailStopState = "locked" | "unlocked" | "completed";

interface TrailStopProps {
  stop: TrailStopData;
  index: number;
  state: TrailStopState;
  // Entry ids this visitor has unlocked by scanning (entry-unlocks.ts).
  unlockedEntryIds: Set<string>;
  // True once this visitor's progress has been read. Without it, every stop
  // would animate open on each page load as the saved progress arrives.
  progressLive?: boolean;
  // The entry the visitor just unlocked by scanning, when they arrived from
  // the scan page. Revealed with motion and scrolled to, once.
  celebrateEntryId?: string | null;
}

export function TrailStop({
  stop,
  index,
  state,
  unlockedEntryIds,
  progressLive = false,
  celebrateEntryId = null,
}: Readonly<TrailStopProps>) {
  const reduceMotion = useReducedMotion();
  const rowRef = useRef<HTMLLIElement>(null);
  const arrivedRef = useRef(false);
  const isLocked = state === "locked";
  const isCompleted = state === "completed";

  // Counts real unlocks. Derived while rendering (React's "adjust state when a
  // prop changes" pattern) so the content that mounts in this same render
  // already knows to animate. A flip counts only when progress was already
  // live on the previous render.
  const [seen, setSeen] = useState({ state, live: progressLive });
  const [unlockPlays, setUnlockPlays] = useState(0);
  if (seen.state !== state || seen.live !== progressLive) {
    setSeen({ state, live: progressLive });
    if (seen.live && progressLive && seen.state === "locked" && state !== "locked") {
      setUnlockPlays((n) => n + 1);
    }
  }
  const animateUnlock = unlockPlays > 0 && !reduceMotion;

  useEffect(() => {
    if (unlockPlays === 0) return;
    if (!reduceMotion) haptic(10);
    const timer = setTimeout(() => {
      rowRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    }, 300);
    return () => clearTimeout(timer);
  }, [unlockPlays, reduceMotion]);

  // Arriving from a scan: bring this stop to the middle of the screen once its
  // content is showing. The flag is set inside the timer so a dev double-run of
  // the effect cannot cancel the only scroll.
  const hasCelebrated =
    celebrateEntryId !== null && stop.discoveryContent.some((entry) => entry.id === celebrateEntryId);
  useEffect(() => {
    if (!hasCelebrated || isLocked || arrivedRef.current) return;
    const timer = setTimeout(() => {
      arrivedRef.current = true;
      rowRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }, 400);
    return () => clearTimeout(timer);
  }, [hasCelebrated, isLocked, reduceMotion]);

  return (
    <li ref={rowRef} className="flex gap-3 py-3">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-colors duration-300",
          isLocked && "bg-muted text-muted-foreground",
          !isLocked && "bg-primary text-primary-foreground"
        )}
      >
        {/* Keyed on the unlock count so each real unlock remounts the number
            and pops it, the same way save-heart.tsx pops on a save. */}
        <motion.span
          key={unlockPlays}
          className="flex"
          initial={animateUnlock ? { scale: 0.4 } : false}
          animate={{ scale: 1 }}
          transition={SPRING_POP}
        >
          {index + 1}
        </motion.span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-base transition-colors duration-300",
              isLocked ? "text-muted-foreground" : "font-semibold text-foreground"
            )}
          >
            {stop.name}
          </span>
          <AnimatePresence initial={false}>
            {isLocked && (
              <motion.span
                key="lock"
                className="flex shrink-0"
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.6 }}
                transition={{ duration: DURATION.fast }}
              >
                <Lock className="h-4 w-4 text-muted-foreground" aria-label="Locked" />
              </motion.span>
            )}
          </AnimatePresence>
          {isCompleted && (
            <CheckCircle weight="fill" className="h-4 w-4 shrink-0 text-primary" aria-label="Completed" />
          )}
        </div>

        {/* Unlocked and completed both show Discovery content, per the
            plan doc's "completed (same as unlocked, visually marked
            done)." A stop holds a list of entries, trail notes first and
            then the place's own entries (trail-query.ts). An empty list is
            a normal valid state, not an error, so nothing renders below
            the name in that case. An entry that needs a scan stays one
            generic line, not its title, until its code has been scanned. */}
        <AnimatePresence initial={false}>
          {!isLocked && stop.discoveryContent.length > 0 && (
            <motion.ul
              key="content"
              className="flex flex-col gap-3 overflow-hidden pt-1"
              initial={animateUnlock ? { height: 0, opacity: 0 } : false}
              animate={{ height: "auto", opacity: 1 }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT }}
            >
              {stop.discoveryContent.map((entry) => {
                if (entry.requiresScan && !unlockedEntryIds.has(entry.id)) {
                  return (
                    <li key={entry.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <QrCode className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Scan the code at the object to read more
                    </li>
                  );
                }
                const celebrate = entry.id === celebrateEntryId && !reduceMotion;
                return (
                  <motion.li
                    key={entry.id}
                    className="flex flex-col gap-1"
                    initial={celebrate ? { opacity: 0, y: 8 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_SETTLE, delay: 0.3 }}
                  >
                    <span className="text-sm font-semibold text-foreground">{entry.title}</span>
                    {entry.photoUrl && (
                      <img
                        src={entry.photoUrl}
                        alt={entry.title}
                        loading="lazy"
                        className="my-1 aspect-video w-full rounded-md object-cover"
                      />
                    )}
                    {entry.videoUrl && <VideoEmbed url={entry.videoUrl} title={entry.title} />}
                    <p className="text-sm text-muted-foreground">{entry.content}</p>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}
