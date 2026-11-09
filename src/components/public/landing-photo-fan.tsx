import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Landing "Features" strip: just photos, no labels. A fan of tilted cards that
 * grow from small (left) to big (right), each overlapping the one before it,
 * revealed one by one when the strip scrolls into view.
 *
 * Which photos show is random per page load (the shuffle happens once, not on
 * resize). How many show depends on the strip's measured width: the layout is
 * computed from that width and scaled down if needed, so the fan always fits
 * inside the strip and never overflows the screen.
 */

export interface FanItem {
  id: string;
  kind: string;
  name: string;
  coverPhotoUrl: string | null;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const MAX_CARDS = 9;
const MIN_CARDS = 3;
// Each card's left edge sits this fraction of the previous card's width after
// the previous card's left edge, so cards overlap by the rest.
const STEP = 0.68;
const MAX_TILT = 16; // degrees, left or right
const SMALL_RATIO = 0.55; // smallest card size relative to the biggest (gentle growth per step)

// Same random numbers for the same card index across resizes, so cards do not
// jump around while the window is dragged.
interface Seed {
  tilt: number;
  drift: number;
}

function makeSeeds(count: number): Seed[] {
  return Array.from({ length: count }, () => ({
    tilt: (Math.random() * 2 - 1) * MAX_TILT,
    drift: Math.random() * 2 - 1,
  }));
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface Placed {
  size: number;
  left: number;
  top: number;
}

// Pure layout for `count` cards inside `width`. Returns card boxes plus the
// stage height. Everything is scaled so the whole fan (with room for tilt) fits.
function layoutFan(width: number, count: number, seeds: Seed[]) {
  const bigTarget = Math.min(Math.max(width * 0.33, 96), 340);
  const smallTarget = bigTarget * SMALL_RATIO;
  const sizes = Array.from({ length: count }, (_, i) =>
    count === 1 ? bigTarget : smallTarget * (bigTarget / smallTarget) ** (i / (count - 1)),
  );
  // Tilted squares poke out a little past their box; reserve that on both ends.
  const tiltRoom = bigTarget * 0.1;
  const rawWidth = sizes.slice(0, -1).reduce((sum, s) => sum + s * STEP, 0) + sizes[count - 1];
  const avail = Math.max(width - tiltRoom * 2, 1);
  // Scale to fill the width: down when it is too wide, and up (to a cap on the
  // big card) when there are few photos, so the fan always runs right up to
  // the text instead of leaving a gap on its left.
  const scale = Math.min(Math.min(1.8, 360 / bigTarget), avail / rawWidth) * 0.9; // 0.9: a little smaller

  const scaled = sizes.map((s) => s * scale);
  const big = scaled[count - 1];
  const jitter = big * 0.05;
  // The fan climbs: small cards sit low on the left, the big one high on the
  // right, like a diagonal filmstrip.
  const height = big * 1.4 + jitter * 2;
  const midY = height / 2;
  const climb = (i: number) => (count === 1 ? 0 : (0.24 - 0.36 * (i / (count - 1))) * big);
  const total = rawWidth * scale;
  // Right-aligned: the big card sits against the edge, beside the heading.
  let x = width - tiltRoom - total;
  const placed: Placed[] = scaled.map((size, i) => {
    const box = { size, left: x, top: midY + climb(i) - size / 2 + seeds[i].drift * jitter * (size / big) };
    x += size * STEP;
    return box;
  });
  return { placed, height };
}

// How many cards fit: the most (up to MAX_CARDS and the photos on hand) whose
// natural fan width does not need shrinking below ~85% of its target size.
function pickCount(width: number, available: number) {
  const bigTarget = Math.min(Math.max(width * 0.33, 96), 340);
  const smallTarget = bigTarget * SMALL_RATIO;
  const avail = Math.max(width - bigTarget * 0.2, 1);
  const cap = Math.min(MAX_CARDS, available);
  for (let n = cap; n >= MIN_CARDS; n--) {
    const sizes = Array.from({ length: n }, (_, i) => smallTarget * (bigTarget / smallTarget) ** (i / (n - 1)));
    const raw = sizes.slice(0, -1).reduce((sum, s) => sum + s * STEP, 0) + sizes[n - 1];
    if (raw <= avail / 0.7) return n;
  }
  return Math.min(cap, MIN_CARDS);
}

function useStageWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.6, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.9, ease: EASE, delay: i * 0.55 },
  }),
};

export function LandingPhotoFanSkeleton() {
  const { ref, width } = useStageWidth();
  const seeds = useMemo(() => makeSeeds(MAX_CARDS), []);
  const count = width > 0 ? pickCount(width, MAX_CARDS) : MIN_CARDS;
  const { placed, height } = layoutFan(Math.max(width, 1), count, seeds);
  return (
    <div ref={ref} className="relative w-full" style={{ height: width > 0 ? height : 240 }} aria-hidden="true">
      {width > 0 &&
        placed.map((p, i) => (
          <Skeleton
            key={i}
            className="absolute rounded-2xl bg-primary-foreground/15"
            style={{ width: p.size, height: p.size, left: p.left, top: p.top, transform: `rotate(${seeds[i].tilt}deg)`, zIndex: i }}
          />
        ))}
    </div>
  );
}

export function LandingPhotoFan({
  items,
  onSelect,
}: Readonly<{ items: FanItem[]; onSelect: (item: FanItem) => void }>) {
  const { ref, width } = useStageWidth();
  // One random order per mount, and one set of tilts and drifts to match.
  const photos = useMemo(() => shuffle(items.filter((item) => item.coverPhotoUrl)), [items]);
  const seeds = useMemo(() => makeSeeds(MAX_CARDS), []);
  // The card under the pointer (or focus) is lifted above all the others.
  const [raised, setRaised] = useState<number | null>(null);

  const count = width > 0 ? pickCount(width, photos.length) : 0;
  const shown = photos.slice(0, count);
  const { placed, height } = layoutFan(Math.max(width, 1), Math.max(shown.length, 1), seeds);

  return (
    <div ref={ref} className="relative w-full" style={{ height: width > 0 ? height : 240 }}>
      {width > 0 && shown.length > 0 && (
        <motion.div
          className="absolute inset-0"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
        >
          {shown.map((item, i) => {
            const p = placed[i];
            return (
              <motion.div
                key={`${item.kind}-${item.id}`}
                custom={i}
                variants={cardVariants}
                className="pointer-events-auto absolute"
                style={{ width: p.size, height: p.size, left: p.left, top: p.top, zIndex: raised === i ? MAX_CARDS + 1 : i }}
                onMouseEnter={() => setRaised(i)}
                onMouseLeave={() => setRaised(null)}
                onFocus={() => setRaised(i)}
                onBlur={() => setRaised(null)}
              >
                {/* The tilt lives on this wrapper so the button's hover transform
                    (a class) does not replace it. The hover is a centered scale
                    only: a translate here would run along the tilted axis and
                    slide the card sideways. */}
                <div className="h-full w-full" style={{ transform: `rotate(${seeds[i].tilt}deg)` }}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    aria-label={item.name}
                    className="block h-full w-full overflow-hidden rounded-2xl border border-primary-foreground/20 bg-primary-foreground/15 shadow-lg transition-transform duration-300 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <img src={item.coverPhotoUrl ?? ""} alt="" className="h-full w-full object-cover" draggable={false} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
