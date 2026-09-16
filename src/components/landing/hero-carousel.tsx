import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useSpring,
  type MotionValue,
} from "motion/react";
import { loopIndex, shortestStep, tileOffsetPx, tileWidthPx, wrappedSlot } from "@/lib/filmstrip";
import type { LandingSlide } from "@/lib/landing-slides";

/**
 * landing-hero-phases.md Phase 4. Structure copied from
 * announcement-carousel.tsx: useSyncedCarousel, useFilmstripTrack,
 * useContainerWidth, the inner filmstrip component, the dots. The math
 * itself (loopIndex/wrappedSlot/shortestStep/tileWidthPx/tileOffsetPx) is
 * imported from filmstrip.ts, not re-derived here, per 4.2 -- this file
 * only changes tile content: an image plus a caption instead of
 * announcement-carousel.tsx's title/date/location text tile.
 *
 * This is landing page content, not the auth popup -- own file, own data
 * source (a slides prop the caller fetches via landing-slides.ts), no
 * relationship to components/auth/*. See landing-hero-plan.md's Hero
 * Carousel section.
 */

const SLIDE_DURATION = 6000; // ms, same value announcement-carousel.tsx uses.

// Same spring conversion announcement-carousel.tsx carries over from
// Qula's work.tsx: damping = dampingRatio * 2 * sqrt(stiffness * mass),
// dampingRatio 0.95, stiffness 100, mass 1 -> damping 19.
const SPRING_STIFFNESS = 100;
const SPRING_DAMPING = 19;
const SPRING_MASS = 1;

// One tile in view, same reasoning announcement-carousel.tsx gives: a
// single hero image reads better full width than several slivers.
const TILES_IN_VIEWPORT = 1;
const TILE_GAP_PX = 12;

// Slot cull buffer, same 1.5 announcement-carousel.tsx uses so an
// incoming tile is mounted a frame before it needs to be visible.
const SLOT_CULL_THRESHOLD = 1.5;

const CLICK_SETTLE_GUARD_MS = 1000;

/**
 * Drives the shared autoplay clock. Ported unchanged from
 * announcement-carousel.tsx's useSyncedCarousel.
 */
function useSyncedCarousel() {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => {
      setTick((t) => t + 1);
    }, SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [tick, paused]);

  const goToTick = (nextTick: number) => {
    setTick(nextTick);
  };

  return { tick, paused, setPaused, goToTick };
}

/**
 * "Portal" looping filmstrip track. Ported unchanged from
 * announcement-carousel.tsx's useFilmstripTrack -- one continuous spring
 * value in tile units, recomputed every frame as the shortest signed
 * distance from the current index, wrapped around the loop.
 */
function useFilmstripTrack(index: number, length: number) {
  const offset = useSpring(0, { stiffness: SPRING_STIFFNESS, damping: SPRING_DAMPING, mass: SPRING_MASS });
  const lastIndexRef = useRef(index);

  useEffect(() => {
    const prev = lastIndexRef.current;
    if (prev === index) return;
    const delta = shortestStep(prev, index, length);
    offset.set(Math.round(offset.get()) + delta);
    lastIndexRef.current = index;
  }, [index, length, offset]);

  return { offset, index, length };
}

// Measures a container's live pixel width via ResizeObserver, same as
// announcement-carousel.tsx's useContainerWidth.
function useContainerWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

interface HeroSlideTileProps {
  slide: LandingSlide;
  slotOffset: number;
  containerWidthPx: number;
}

// One tile in the filmstrip. Image filling the tile with object-cover,
// plus a solid caption bar at the bottom -- per 4.4/4.5, a flat card-
// surface bar, not a gradient scrim. decision-log #2's scrim exception is
// retired, not inherited (see landing-hero-plan.md's Flagged Conflicts
// #2), so this is a fresh, gradient-free legibility answer. No link, no
// click target: these are not navigation, unlike AnnouncementTile.
function HeroSlideTile({ slide, slotOffset, containerWidthPx }: Readonly<HeroSlideTileProps>) {
  return (
    <motion.div
      className="absolute top-0 h-full w-full overflow-hidden rounded-lg border border-border bg-card"
      style={{
        width: tileWidthPx(containerWidthPx, TILES_IN_VIEWPORT, TILE_GAP_PX),
        left: 0,
        x: tileOffsetPx(slotOffset, containerWidthPx, TILES_IN_VIEWPORT, TILE_GAP_PX),
      }}
    >
      <img src={slide.image_url} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-card px-4 py-3">
        <p className="truncate text-sm font-medium text-foreground">{slide.caption}</p>
      </div>
    </motion.div>
  );
}

// Separated so the live spring value can be read every frame via
// useMotionValueEvent without re-rendering the parent, same split
// announcement-carousel.tsx's AnnouncementFilmstripInner uses.
function HeroFilmstripInner({
  slides,
  offset,
  containerWidthPx,
}: Readonly<{
  slides: LandingSlide[];
  offset: MotionValue<number>;
  containerWidthPx: number;
}>) {
  const [liveOffset, setLiveOffset] = useState(() => offset.get());
  useMotionValueEvent(offset, "change", (v) => setLiveOffset(v));

  const count = slides.length;

  return (
    <>
      {slides.map((slide, i) => {
        const slot = wrappedSlot(i, count, liveOffset);
        if (Math.abs(slot) > SLOT_CULL_THRESHOLD) return null;
        return (
          <HeroSlideTile key={slide.id} slide={slide} slotOffset={slot} containerWidthPx={containerWidthPx} />
        );
      })}
    </>
  );
}

// Flat panel using the app's own surface tokens, no image asset. Per 4.8:
// there is no fallback photo to reach for once auth-bg.png is gone (see
// landing-hero-plan.md's Hero Carousel render rules), so an empty,
// loading, or failed state renders this instead of inventing one.
function HeroCarouselFallback() {
  return (
    <div className="flex h-full min-h-64 w-full items-center justify-center rounded-lg border border-border bg-card">
      <p className="text-sm text-muted-foreground">Pasig, up close.</p>
    </div>
  );
}

interface HeroCarouselProps {
  /** Active slides in carousel order. This component does no fetching --
   *  the page owns the query and passes the result in, per 4.9. */
  slides: LandingSlide[];
  loading?: boolean;
  error?: boolean;
}

/**
 * Image hero carousel for the landing page's right column. Same
 * autoplay/loop/pause/dots behavior as announcement-carousel.tsx: 6s
 * autoplay, pause on hover, wraparound filmstrip, progress dots with
 * animated fill, click-settle guard (kept even though tiles have no click
 * target, since dot clicks still jump the clock, per 4.7).
 */
export function HeroCarousel({ slides, loading = false, error = false }: Readonly<HeroCarouselProps>) {
  const count = slides.length;
  const { tick, paused, setPaused, goToTick } = useSyncedCarousel();
  const index = count > 0 ? loopIndex(tick, count) : 0;
  const track = useFilmstripTrack(index, count || 1);

  const clickGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardAutoplayThroughClickSettle = () => {
    setPaused(true);
    if (clickGuardTimerRef.current) clearTimeout(clickGuardTimerRef.current);
    clickGuardTimerRef.current = setTimeout(() => setPaused(false), CLICK_SETTLE_GUARD_MS);
  };

  const handleDotClick = (targetIndex: number) => {
    if (targetIndex === index) return;
    const diffForward = (targetIndex - index + count) % count;
    const diffBackward = diffForward - count;
    const delta = diffForward <= Math.abs(diffBackward) ? diffForward : diffBackward;
    guardAutoplayThroughClickSettle();
    goToTick(tick + delta);
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerWidthPx = useContainerWidth(containerRef);

  // Zero slides, loading, or fetch failed: flat fallback panel, per 4.8.
  if (loading || error || count === 0) {
    return <HeroCarouselFallback />;
  }

  return (
    <div>
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="relative h-64 w-full overflow-hidden sm:h-80 lg:h-96"
        ref={containerRef}
      >
        {containerWidthPx > 0 && (
          <HeroFilmstripInner slides={slides} offset={track.offset} containerWidthPx={containerWidthPx} />
        )}
      </div>

      {/* Progress dots, only past a single slide -- same count > 1 rule
          announcement-carousel.tsx applies, per 4.6. */}
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => handleDotClick(i)}
              aria-label={`Show slide ${i + 1}`}
              className="group/dot relative flex h-4 items-center"
            >
              <span
                className={`relative block h-2 overflow-hidden rounded-full bg-border transition-all duration-300 ${
                  i === index ? "w-8" : "w-2 group-hover/dot:bg-muted-foreground"
                }`}
              >
                {i === index && (
                  <motion.span
                    key={`${slide.id}-${index}`}
                    className="absolute inset-y-0 left-0 rounded-full bg-accent"
                    initial={{ width: "0%" }}
                    animate={{ width: paused ? undefined : "100%" }}
                    transition={{ duration: SLIDE_DURATION / 1000, ease: "linear" }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
