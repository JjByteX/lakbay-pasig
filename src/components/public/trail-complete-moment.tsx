import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { Certificate } from "@phosphor-icons/react";
import { fetchNextTrail } from "@/lib/next-trail";
import { SPRING_ARRIVE, SPRING_STAMP, haptic } from "@/lib/motion";
import type { TrailSummary } from "@/lib/trail-types";
import { Button } from "@/components/ui/button";
import { Burst } from "./burst";
import { RevealWords } from "./text-motion";
import { TrailCard } from "./trail-card";

/**
 * Shown on the trail page the moment a walk is recorded as finished, and only
 * then (trail-detail.tsx sets it once the completion write succeeds, never on
 * a later visit). Three beats, in onboarding's motion language:
 *
 * 1. A postcard drops in and settles with a slight tilt: "Trail complete" rises
 *    word by word over the trail's name, the credential if there is one, and
 *    today's date.
 * 2. A credential stamp lands on its corner with a half turn and a burst of
 *    dots, with a short haptic (the stamp is the reward, so it is the one
 *    moment that gets a longer buzz).
 * 3. The next thing to walk rises in beneath it, so the end of a trail is a
 *    step to the next one, not a dead end. When every trail is walked it says
 *    so and points at Discover.
 *
 * A personal record, never a ranking: no counts, no "Nth person", nothing
 * compared across visitors (competitive-positioning.md). Official trails
 * only; a personal trail never completes. Flat color and movement, no glow, no
 * gradient (ux-ui-guidelines.md). Off under reduced motion.
 */
export function TrailCompleteMoment({
  userId,
  trail,
}: Readonly<{
  userId: string;
  trail: { id: string; name: string; theme: string | null; credentialName: string | null };
}>) {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  // undefined while looking, null when there is nothing left to suggest.
  const [next, setNext] = useState<TrailSummary | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchNextTrail(userId, { id: trail.id, theme: trail.theme })
      .then((result) => {
        if (!cancelled) setNext(result);
      })
      .catch(() => {
        // A suggestion is a bonus: if it fails, say nothing rather than error
        // on the screen that is celebrating.
        if (!cancelled) setNext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, trail.id, trail.theme]);

  // The buzz lands with the stamp.
  useEffect(() => {
    if (reduceMotion) return;
    const timer = setTimeout(() => haptic([10, 40, 20]), 750);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  const date = new Date().toLocaleDateString(undefined, { dateStyle: "long" });

  return (
    <section aria-label="Trail complete" className="flex flex-col gap-6">
      <motion.div
        className="relative flex flex-col gap-2 rounded-lg border border-border bg-card p-6"
        initial={reduceMotion ? false : { opacity: 0, y: -40, rotate: -6 }}
        animate={{ opacity: 1, y: 0, rotate: reduceMotion ? 0 : -2 }}
        transition={{ ...SPRING_ARRIVE, delay: 0.1 }}
      >
        <span className="absolute -right-2 -top-3 flex h-12 w-12 items-center justify-center">
          <Burst ring={false} distance={44} delay={0.75} />
          <motion.span
            className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            initial={reduceMotion ? false : { scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: reduceMotion ? 0 : 6 }}
            transition={{ ...SPRING_STAMP, delay: 0.7 }}
          >
            <Certificate weight="fill" className="h-7 w-7" aria-hidden="true" />
          </motion.span>
        </span>

        <p className="pr-10 text-xl font-semibold text-foreground">
          <RevealWords text="Trail complete" delay={0.3} />
        </p>
        <p className="text-base text-foreground">{trail.name}</p>
        {trail.credentialName && <p className="text-sm text-muted-foreground">Earned: {trail.credentialName}</p>}
        <p className="text-sm text-muted-foreground">{date}</p>
      </motion.div>

      {next !== undefined && (
        <motion.div
          className="flex flex-col gap-2"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_ARRIVE, delay: 0.5 }}
        >
          {next ? (
            <>
              <p className="text-sm font-semibold text-foreground">Walk next</p>
              <div className="overflow-hidden rounded-lg border border-border">
                <TrailCard trail={next} onClick={() => navigate(`/trails/${next.id}`)} />
              </div>
            </>
          ) : (
            <>
              <p className="text-base text-muted-foreground">You&apos;ve walked every trail for now. Explore places next.</p>
              <Button variant="outline" className="self-start" onClick={() => navigate("/discover")}>
                Browse places
              </Button>
            </>
          )}
        </motion.div>
      )}
    </section>
  );
}
