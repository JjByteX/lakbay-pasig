import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ImageOff } from "lucide-react";
import type { LandingSlide } from "@/lib/landing-slides";
import { loopIndex, shortestStep, tileOffsetPx, tileWidthPx, wrappedSlot } from "@/lib/filmstrip";

/**
 * Landing hero carousel. Ported from Qula's
 * src/components/sections/work.tsx "Our Work" Portal filmstrip -- the
 * project row, read end to end, not just the client-photo strip
 * announcement-carousel.tsx was scoped down to. Same chain, same math:
 *
 *   useSyncedCarousel  ->  tick (absolute counter) + paused, one
 *                          setTimeout loop per tick
 *   loopIndex(tick)    ->  active index
 *   useFilmstripTrack  ->  spring `offset` (tile units) + `dragTiles`;
 *                          `combined` = offset + drag; an index change
 *                          nudges the spring by the shortest signed step
 *   useLiveSwipe       ->  pointer events feed begin/update/endDrag; the
 *                          strip follows the finger 1:1, then commits on
 *                          release past 18% of a tile or 500 px/s
 *   wrappedSlot        ->  recomputed from `combined` EVERY frame (the
 *                          "Portal": a tile leaving one edge is the same
 *                          tile re-entering the other, never a teleport)
 *   tile geometry      ->  plain pixel numbers from a ResizeObserver
 *                          width, never a calc() string inside a transform
 *   progress dots      ->  active dot fills over SLIDE_DURATION
 *
 * Loop math lives in lib/filmstrip.ts and is reused as-is, per
 * decision-log.md entry #18's standing rule (any future carousel reuses
 * filmstrip.ts, never a new carousel dependency). Drag math is local to
 * this file: filmstrip.ts is pure loop/geometry, and only this carousel
 * has a drag layer.
 *
 * What is deliberately NOT ported from Qula: the project modal, gallery,
 * lightbox, dominant-color sampling, tags and CTA. A landing_slides row
 * (0033) only carries image_url + caption, so there is nothing for those
 * to show, and the schema is not this file's to change.
 *
 * Adapted to this codebase, not to Qula's:
 * - Caption legibility: a solid caption bar under the image at the full
 *   card surface token, per decision-log.md entry #18. Qula's dark
 *   gradient scrim over the photo is a structural gradient, which
 *   ux-ui-guidelines.md bans.
 * - Tile count follows the PANEL's own measured width, not the viewport.
 *   On desktop this panel is half the screen, so Qula's viewport
 *   breakpoint would pick the wrong layout. Wide panel + 3 or more
 *   slides peeks neighbors (Qula desktop's 1.8 tiles); narrow panel, or
 *   exactly 2 slides (both neighbors would be the same tile), shows one
 *   tile.
 * - Progress fill is bg-primary. --accent in index.css already carries
 *   its own alpha ("356 90% 45% / 0.1"), so bg-accent renders as a faint
 *   tint and bg-accent/NN produces invalid CSS.
 * - Icons are lucide-react, the project's library, not Phosphor.
 * - Weights and radius follow ux-ui-guidelines.md (400/600 only, the
 *   rounded-lg token, not Qula's font-bold and rounded-[12px]).
 */

const SLIDE_DURATION = 6000; // ms, Qula's value: long enough to read a caption

// KDE "Smooth Swipe" spring, converted the way Qula's work.tsx does it:
// damping = dampingRatio * 2 * sqrt(stiffness * mass) = 0.95 * 2 * 10 = 19.
const SPRING_STIFFNESS = 100;
const SPRING_DAMPING = 19;
const SPRING_MASS = 1;

const TILE_GAP_PX = 12; // Qula's gap, baked into the position math
const CLICK_SETTLE_GUARD_MS = 1000; // Qula's click-settle window
const SWIPE_DISTANCE_RATIO = 0.18; // fraction of a tile, Qula's commit threshold
const SWIPE_VELOCITY = 500; // px/s, Qula's flick threshold

// Below this panel width a peek layout leaves side tiles too thin to
// read (Qula's mobile branch makes the same call, at 640px of viewport).
const PEEK_MIN_PANEL_PX = 640;
const TILES_PEEK = 1.8; // Qula desktop's TILES_IN_VIEWPORT
const TILES_SINGLE = 1;

/**
 * Autoplay clock. Ported unchanged from Qula's useSyncedCarousel: `tick`
 * is the one source of truth the index derives from, `paused` freezes
 * the timer, goToTick jumps to an absolute tick.
 */
function useSyncedCarousel(enabled: boolean) {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!enabled || paused) return;
    const timer = setTimeout(() => setTick((t) => t + 1), SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [tick, paused, enabled]);

  const goToTick = useCallback((nextTick: number) => setTick(nextTick), []);

  return { tick, paused, setPaused, goToTick };
}

/**
 * Portal filmstrip track. Ported from Qula's useFilmstripTrack including
 * the drag layer announcement-carousel.tsx left out.
 *
 * `offset` is a spring in TILE units; `dragTiles` is the live finger
 * delta in tile units; `combined` is their sum, which is what every tile
 * reads each frame. endDrag rounds before it steps so an interrupted
 * spring (a quick flick-flick-flick) can never leave a fractional peek.
 */
function useFilmstripTrack(index: number, length: number) {
  const offset = useSpring(0, {
    stiffness: SPRING_STIFFNESS,
    damping: SPRING_DAMPING,
    mass: SPRING_MASS,
  });
  const dragTiles = useMotionValue(0);
  const isDraggingRef = useRef(false);
  const lastIndexRef = useRef(index);

  useEffect(() => {
    if (isDraggingRef.current) {
      lastIndexRef.current = index;
      return;
    }
    const prev = lastIndexRef.current;
    if (prev === index) return;
    const delta = shortestStep(prev, index, length);
    // Round first: if this fires again mid-flight (autoplay tick, fast
    // dot clicks), adding a whole delta onto a fractional in-flight value
    // would compound drift instead of landing on the next whole tile.
    offset.set(Math.round(offset.get()) + delta);
    lastIndexRef.current = index;
  }, [index, length, offset]);

  const combined = useTransform([offset, dragTiles], ([o, d]: number[]) => o + d);

  const beginDrag = useCallback(() => {
    isDraggingRef.current = true;
    dragTiles.jump(0);
  }, [dragTiles]);

  const updateDrag = useCallback(
    (offsetPx: number, tilePx: number) => {
      if (!tilePx) return;
      dragTiles.set(-offsetPx / tilePx);
    },
    [dragTiles]
  );

  const endDrag = useCallback(
    (settleDelta: number) => {
      isDraggingRef.current = false;
      const live = dragTiles.get();
      dragTiles.jump(0);
      // offset.get() is not guaranteed to be a whole tile here (grabbing
      // the strip again while the spring is still moving), so step from
      // the rounded value, never the raw one.
      const restingBase = Math.round(offset.get());
      const settledBase = restingBase + live;
      offset.jump(settledBase);
      lastIndexRef.current = index;
      // Committed swipe: land exactly one whole tile from the rounded
      // pre-drag position, NOT settledBase + settleDelta -- a long or
      // fast swipe carries `live` past a full tile, and stacking
      // settleDelta on that overshoot parks the spring on 2.4 instead of
      // 2, a permanent peek. Uncommitted: animate back to the nearest
      // whole tile instead of leaving the strip wherever the finger let go.
      if (settleDelta !== 0) {
        offset.set(restingBase + settleDelta);
      } else {
        offset.set(Math.round(settledBase));
      }
    },
    [dragTiles, offset, index]
  );

  return { combined, beginDrag, updateDrag, endDrag };
}

type Track = ReturnType<typeof useFilmstripTrack>;

/**
 * Pointer -> drag wiring. Ported from Qula's useLiveSwipe: the strip
 * follows the finger 1:1 while it is down, and hands off to the spring
 * only on release.
 *
 * Qula enables this on mobile only, because its desktop has click-based
 * prev/next. Here it is always on: this hero has no prev/next buttons
 * (dots only, per ux-ui-guidelines.md's one-trigger rule), so drag is
 * the direct-manipulation path on every device.
 */
function useLiveSwipe({
  enabled,
  tilesInViewport,
  tick,
  goToTick,
  track,
  setPaused,
}: {
  enabled: boolean;
  tilesInViewport: number;
  tick: number;
  goToTick: (nextTick: number) => void;
  track: Track;
  setPaused: (v: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef(0);
  const lastX = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const active = useRef(false);
  // Set once the pointer has moved far enough to count as a drag, so the
  // click that fires on release can be swallowed instead of also opening
  // whatever sits under the finger.
  const moved = useRef(false);

  const tilePx = () => {
    const width = containerRef.current?.offsetWidth ?? 0;
    return tileWidthPx(width, tilesInViewport, TILE_GAP_PX) || 1;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    active.current = true;
    moved.current = false;
    setPaused(true);
    startX.current = e.clientX;
    lastX.current = e.clientX;
    lastT.current = performance.now();
    velocity.current = 0;
    track.beginDrag();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!active.current) return;
    const now = performance.now();
    const dt = now - lastT.current;
    if (dt > 0) velocity.current = ((e.clientX - lastX.current) / dt) * 1000; // px/s
    lastX.current = e.clientX;
    lastT.current = now;
    const offsetPx = e.clientX - startX.current;
    if (Math.abs(offsetPx) > 4) moved.current = true;
    track.updateDrag(offsetPx, tilePx());
  };

  const finish = () => {
    if (!active.current) return;
    active.current = false;
    const offsetPx = lastX.current - startX.current;
    const threshold = tilePx() * SWIPE_DISTANCE_RATIO;
    if (offsetPx < -threshold || velocity.current < -SWIPE_VELOCITY) {
      track.endDrag(1);
      goToTick(tick + 1);
    } else if (offsetPx > threshold || velocity.current > SWIPE_VELOCITY) {
      track.endDrag(-1);
      goToTick(tick - 1);
    } else {
      track.endDrag(0);
    }
    setPaused(false);
  };

  return {
    containerRef,
    /** True for the click that immediately follows a real drag. */
    wasDragged: () => moved.current,
    handlers: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp: finish,
          onPointerCancel: finish,
        }
      : {},
  };
}

// Live pixel width of a container via ResizeObserver, same as Qula's
// useContainerWidth, so tile geometry resolves to plain numbers.
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

interface HeroTileProps {
  slide: LandingSlide;
  slotOffset: number;
  containerWidthPx: number;
  tilesInViewport: number;
  isCenter: boolean;
  onSelect: () => void;
}

// One tile. Every tile is the same fixed box (Qula's rule): the image
// fills the top, the caption sits in a solid bar below it in normal
// flow, never overlaid on the photo. Side tiles stay visible as peeks
// but get no pointer target of their own beyond "bring me to center".
function HeroTile({
  slide,
  slotOffset,
  containerWidthPx,
  tilesInViewport,
  isCenter,
  onSelect,
}: Readonly<HeroTileProps>) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      // A side tile is a "go here" target; the center tile has nothing to
      // open (no detail view exists for a landing slide), so it is not
      // focusable as a control.
      tabIndex={isCenter ? -1 : 0}
      aria-hidden={isCenter ? undefined : true}
      aria-label={isCenter ? undefined : `Show ${slide.caption}`}
      className="absolute top-0 flex h-full flex-col overflow-hidden rounded-lg bg-card text-left"
      style={{
        width: tileWidthPx(containerWidthPx, tilesInViewport, TILE_GAP_PX),
        left: 0,
        x: tileOffsetPx(slotOffset, containerWidthPx, tilesInViewport, TILE_GAP_PX),
      }}
    >
      <div className="relative w-full flex-1 overflow-hidden bg-muted">
        {imageFailed ? (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <img
            src={slide.image_url}
            alt={slide.caption}
            className="absolute inset-0 h-full w-full select-none object-cover"
            draggable={false}
            loading="eager"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      <div className="flex h-16 items-center border-t border-border bg-card px-4 sm:h-20 sm:px-6">
        <p className="line-clamp-2 text-sm font-semibold text-card-foreground sm:text-base">
          {slide.caption}
        </p>
      </div>
    </motion.button>
  );
}

// Separated so the live spring value is read every frame without
// re-rendering the parent -- each tile's wrapped slot is recomputed
// straight from the motion value on every paint (the Portal).
function HeroFilmstripInner({
  slides,
  combined,
  containerWidthPx,
  tilesInViewport,
  onSelect,
}: Readonly<{
  slides: LandingSlide[];
  combined: MotionValue<number>;
  containerWidthPx: number;
  tilesInViewport: number;
  onSelect: (index: number) => void;
}>) {
  const [liveOffset, setLiveOffset] = useState(() => combined.get());
  useMotionValueEvent(combined, "change", (v) => setLiveOffset(v));

  const count = slides.length;
  // Cull anything outside the visible range plus a one-tile buffer so an
  // incoming tile is already mounted a frame before it is needed. Qula
  // culls at 1.5 for a 1.8-tile viewport; a single-tile viewport only
  // ever shows +-1.
  const cullAt = tilesInViewport > 1 ? 1.5 : 1.25;

  return (
    <>
      {slides.map((slide, i) => {
        const slot = wrappedSlot(i, count, liveOffset);
        if (Math.abs(slot) > cullAt) return null;
        return (
          <HeroTile
            key={slide.id}
            slide={slide}
            slotOffset={slot}
            containerWidthPx={containerWidthPx}
            tilesInViewport={tilesInViewport}
            isCenter={Math.abs(slot) < 0.5}
            onSelect={() => onSelect(i)}
          />
        );
      })}
    </>
  );
}

// A carousel of one has nothing to loop or drag, so render the photo and
// caption bar with none of the carousel chrome.
function StaticSlide({ slide }: Readonly<{ slide: LandingSlide }>) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-card">
      <div className="relative w-full flex-1 overflow-hidden bg-muted">
        {imageFailed ? (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <img
            src={slide.image_url}
            alt={slide.caption}
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      <div className="flex h-16 items-center border-t border-border bg-card px-4 sm:h-20 sm:px-6">
        <p className="line-clamp-2 text-sm font-semibold text-card-foreground sm:text-base">
          {slide.caption}
        </p>
      </div>
    </div>
  );
}

interface HeroCarouselProps {
  slides: LandingSlide[];
}

/**
 * Right-hand panel of the landing hero. Fills whatever box the page gives
 * it (landing.tsx sizes that box), so it carries no height of its own.
 *
 * Zero slides: a flat panel with one line, same empty-state rule as the
 * rest of the app (say it once). One slide: static. Two or more: the
 * looping filmstrip.
 */
export function HeroCarousel({ slides }: Readonly<HeroCarouselProps>) {
  const count = slides.length;

  if (count === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-card p-8">
        <p className="text-center text-sm text-muted-foreground">No slides yet.</p>
      </div>
    );
  }

  if (count === 1) {
    return (
      <div className="h-full w-full p-3 sm:p-4">
        <StaticSlide slide={slides[0]} />
      </div>
    );
  }

  return <HeroFilmstrip slides={slides} />;
}

function HeroFilmstrip({ slides }: Readonly<{ slides: LandingSlide[] }>) {
  const count = slides.length;
  const { tick, paused, setPaused, goToTick } = useSyncedCarousel(true);
  const index = loopIndex(tick, count);
  const track = useFilmstripTrack(index, count);

  // Measured on the strip itself, so tile count follows the panel's real
  // width (a half-screen column on desktop), not the viewport.
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [panelWidthPx, setPanelWidthPx] = useState(0);
  const measuredWidthPx = useContainerWidth(stripRef);
  useEffect(() => setPanelWidthPx(measuredWidthPx), [measuredWidthPx]);

  // Exactly 2 slides would put the same tile on both sides of the center
  // (wrappedSlot folds the midpoint to the negative side, so one
  // neighbor is left-only), so 2 slides always show a single tile.
  const tilesInViewport =
    count >= 3 && panelWidthPx >= PEEK_MIN_PANEL_PX ? TILES_PEEK : TILES_SINGLE;

  const swipe = useLiveSwipe({
    enabled: true,
    tilesInViewport,
    tick,
    goToTick,
    track,
    setPaused,
  });

  // useLiveSwipe owns the strip's container ref (it needs the width for
  // drag math); the ResizeObserver above reads the same element.
  const setStripRef = useCallback(
    (el: HTMLDivElement | null) => {
      stripRef.current = el;
      swipe.containerRef.current = el;
    },
    [swipe.containerRef]
  );

  const clickGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardAutoplayThroughClickSettle = () => {
    setPaused(true);
    if (clickGuardTimerRef.current) clearTimeout(clickGuardTimerRef.current);
    clickGuardTimerRef.current = setTimeout(() => setPaused(false), CLICK_SETTLE_GUARD_MS);
  };
  useEffect(
    () => () => {
      if (clickGuardTimerRef.current) clearTimeout(clickGuardTimerRef.current);
    },
    []
  );

  // Shortest-direction jump to an index, used by both dots and side-tile
  // clicks so they can never disagree about which way to travel.
  const goToIndex = (target: number) => {
    if (target === index) return;
    const diffForward = (target - index + count) % count;
    const diffBackward = diffForward - count;
    const delta = diffForward <= Math.abs(diffBackward) ? diffForward : diffBackward;
    guardAutoplayThroughClickSettle();
    goToTick(tick + delta);
  };

  const handleTileSelect = (target: number) => {
    // The click that ends a drag must not also navigate.
    if (swipe.wasDragged()) return;
    goToIndex(target);
  };

  // Pause while the pointer is over the hero, or while the tab is hidden.
  // Hover-only pausing has a trap here: the auth popup is a Radix Dialog
  // opened from this same page, and a pointer that leaves to reach it is
  // "left" without ever firing mouseleave on the strip, which would leave
  // autoplay frozen after the popup closes. pointerleave plus a
  // visibility/blur reset on window focus covers that.
  useEffect(() => {
    const resume = () => setPaused(false);
    const onVisibility = () => {
      if (document.hidden) setPaused(true);
      else resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", resume);
    };
  }, [setPaused]);

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3 sm:p-4">
      <div
        ref={setStripRef}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setPaused(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setPaused(false);
        }}
        {...swipe.handlers}
        className="relative min-h-0 w-full flex-1 touch-pan-y overflow-hidden rounded-lg"
        role="group"
        aria-roledescription="carousel"
        aria-label="Featured Pasig places"
      >
        {measuredWidthPx > 0 && (
          <HeroFilmstripInner
            slides={slides}
            combined={track.combined}
            containerWidthPx={measuredWidthPx}
            tilesInViewport={tilesInViewport}
            onSelect={handleTileSelect}
          />
        )}
      </div>

      {/* Progress dots, Qula's ClientPhotoStrip pattern: the active dot
          widens and fills over SLIDE_DURATION; the key restarts the fill
          on every index change. While paused the fill holds where it is. */}
      <div className="flex shrink-0 items-center justify-center gap-2">
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => goToIndex(i)}
            aria-label={`Show ${slide.caption}`}
            aria-current={i === index ? "true" : undefined}
            className="group/dot relative flex h-4 items-center"
          >
            <span
              className={`relative block h-2 overflow-hidden rounded-full bg-secondary-foreground/30 transition-all duration-300 ${
                i === index ? "w-8" : "w-2 group-hover/dot:bg-secondary-foreground/60"
              }`}
            >
              {i === index && (
                <motion.span
                  key={`${slide.id}-${index}`}
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: paused ? undefined : "100%" }}
                  transition={{ duration: SLIDE_DURATION / 1000, ease: "linear" }}
                />
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
