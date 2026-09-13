import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValueEvent,
  useSpring,
  type MotionValue,
} from "motion/react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "./announcement-card";
import { loopIndex, shortestStep, tileOffsetPx, tileWidthPx, wrappedSlot } from "@/lib/filmstrip";
import type { Announcement } from "@/lib/home-types";

/**
 * Ported from Qula's src/components/sections/work.tsx "Our Work" carousel
 * (the "portal thingy" in the People We Work With / client-photo strip,
 * which is synced to the same clock as the project filmstrip above it).
 * Same autoplay-clock + Portal-wraparound-filmstrip logic, exact math,
 * carried over 1:1 -- only the tile content, viewport tile count, and
 * gallery/drag/dominant-color machinery (none of which apply to a single-
 * column Announcements card) are scoped down. Per user instruction: copy
 * the carousel/portal logic exactly, not the surrounding portfolio-modal
 * feature set.
 *
 * Framer Motion added as a new dependency (package.json) specifically for
 * this, per explicit instruction -- see decision-log.md conventions this
 * codebase otherwise follows for flagging a schema/architecture change;
 * this is the dependency equivalent, flagged in the same spirit. Requires
 * one `npm install` before this file will render; nothing here can install
 * it for you.
 */

const SLIDE_DURATION = 6000; // ms, same value Qula's work.tsx uses -- long
// enough to read a title/date/location before it auto-advances.

// Same spring conversion Qula's work.tsx derives from KDE's "Smooth Swipe"
// KWin effect: damping = dampingRatio * 2 * sqrt(stiffness * mass), with
// dampingRatio 0.95, stiffness 100, mass 1 -> damping 19. Carried over
// verbatim, not re-tuned.
const SPRING_STIFFNESS = 100;
const SPRING_DAMPING = 19;
const SPRING_MASS = 1;

// Single-tile-per-view: this carousel is one card wide inside a max-w-md
// feed, not a wide portfolio strip peeking at neighbors. Qula's own mobile
// breakpoint already uses 1 tile in viewport for the same reason (narrow
// viewport, one legible tile beats several slivers) -- this reuses that
// same value for every width, not just mobile, since Announcements never
// gets wide enough to justify peeking neighbors.
const TILES_IN_VIEWPORT = 1;
const TILE_GAP_PX = 12; // same gap Qula's work.tsx bakes into its position math

/**
 * Drives the shared autoplay clock. Ported unchanged from Qula's
 * useSyncedCarousel: `tick` is the single source of truth the filmstrip
 * derives its index from, `paused` freezes the timer (hover, or an
 * in-flight click-settle guard), goToTick lets a dot click jump directly to
 * an absolute tick.
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
 * "Portal" looping filmstrip track. Ported unchanged from Qula's
 * useFilmstripTrack: one continuous spring value in TILE units (not
 * percent, not pixels). A tile exiting one edge isn't removed and
 * re-spawned on the other side -- every tile's screen position is
 * recomputed every frame as the shortest signed distance from the current
 * index, wrapped around the loop, so the flip from "off the left, far
 * away" to "off the right, just as far away" is the same formula
 * re-evaluating, not a teleport.
 */
function useFilmstripTrack(index: number, length: number) {
  const offset = useSpring(0, { stiffness: SPRING_STIFFNESS, damping: SPRING_DAMPING, mass: SPRING_MASS });
  const lastIndexRef = useRef(index);

  useEffect(() => {
    const prev = lastIndexRef.current;
    if (prev === index) return;
    // Shortest signed step from prev -> index around the loop, so a wrap
    // (last item -> first item) animates one tile-width forward instead of
    // spinning back through the whole strip.
    const delta = shortestStep(prev, index, length);
    offset.set(Math.round(offset.get()) + delta);
    lastIndexRef.current = index;
  }, [index, length, offset]);

  return { offset, index, length };
}

// Measures a container's live pixel width via ResizeObserver, same as
// Qula's useContainerWidth, so tile geometry resolves to plain numbers
// instead of a mixed %/px calc() string inside a Motion transform.
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

interface AnnouncementTileProps {
  announcement: Announcement;
  slotOffset: number;
  containerWidthPx: number;
  onClick: () => void;
}

// One tile in the filmstrip. Content only (title/date/location/category),
// no image -- announcements carry no photo field (data-model.md's Event/
// Announcement fields), so this keeps announcement-card.tsx's existing
// text-only row content, laid out as a filmstrip tile instead of a list
// row.
function AnnouncementTile({ announcement, slotOffset, containerWidthPx, onClick }: Readonly<AnnouncementTileProps>) {
  const formattedDate = formatDateTime(announcement.date_time);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="group absolute top-0 flex h-full w-full flex-col items-start justify-center gap-1 overflow-hidden rounded-lg border border-border bg-card px-6 py-4 text-left transition-colors hover:bg-muted"
      style={{
        width: tileWidthPx(containerWidthPx, TILES_IN_VIEWPORT, TILE_GAP_PX),
        left: 0,
        x: tileOffsetPx(slotOffset, containerWidthPx, TILES_IN_VIEWPORT, TILE_GAP_PX),
      }}
    >
      <span className="w-full truncate text-base font-semibold text-foreground">{announcement.title}</span>
      {(formattedDate || announcement.location) && (
        <span className="w-full truncate text-sm text-muted-foreground">
          {[formattedDate, announcement.location].filter(Boolean).join(" · ")}
        </span>
      )}
      {announcement.category && <Badge variant="secondary">{announcement.category}</Badge>}
    </motion.button>
  );
}

// Separated so the live spring value can be read every frame via
// useMotionValueEvent without re-rendering the parent -- same split
// Qula's ProjectFilmstripInner uses (Qula also combines a drag MotionValue
// in via useTransform; this carousel has no drag layer, so it reads the
// spring's offset directly).
function AnnouncementFilmstripInner({
  announcements,
  offset,
  containerWidthPx,
  onOpen,
}: {
  announcements: Announcement[];
  offset: MotionValue<number>;
  containerWidthPx: number;
  onOpen: (id: string) => void;
}) {
  const [liveOffset, setLiveOffset] = useState(() => offset.get());
  useMotionValueEvent(offset, "change", (v) => setLiveOffset(v));

  const count = announcements.length;

  return (
    <>
      {announcements.map((announcement, i) => {
        const slot = wrappedSlot(i, count, liveOffset);
        // Cull anything past the visible range, small buffer so a tile
        // animating into place doesn't pop in abruptly. Same >1.5 cull
        // Qula's work.tsx uses for its 1.8-tile desktop viewport; with a
        // 1-tile viewport here the buffer still gives the incoming tile a
        // frame to be mounted before it needs to be visible.
        if (Math.abs(slot) > 1.5) return null;
        return (
          <AnnouncementTile
            key={announcement.id}
            announcement={announcement}
            slotOffset={slot}
            containerWidthPx={containerWidthPx}
            onClick={() => onOpen(announcement.id)}
          />
        );
      })}
    </>
  );
}

interface AnnouncementCarouselProps {
  announcements: Announcement[];
  onOpen: (id: string) => void;
}

/**
 * Replaces the plain <ul> list of AnnouncementCard rows with an
 * automatically-advancing carousel, same autoplay/loop/pause logic as
 * Qula's work.tsx client-photo strip (the "people we work with" portal
 * carousel). Pauses on hover, same as Qula's ProjectCarousel/
 * ClientPhotoStrip; a tile click also guards the autoplay clock through a
 * short settle window so a click-triggered jump doesn't fight the timer's
 * own next tick mid-animation.
 */
export function AnnouncementCarousel({ announcements, onOpen }: Readonly<AnnouncementCarouselProps>) {
  const count = announcements.length;
  const { tick, paused, setPaused, goToTick } = useSyncedCarousel();
  const index = loopIndex(tick, count);
  const track = useFilmstripTrack(index, count);

  const CLICK_SETTLE_GUARD_MS = 1000;
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

  return (
    <div>
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="relative h-32 w-full overflow-hidden"
        ref={containerRef}
      >
        {containerWidthPx > 0 && (
          <AnnouncementFilmstripInner
            announcements={announcements}
            offset={track.offset}
            containerWidthPx={containerWidthPx}
            onOpen={onOpen}
          />
        )}
      </div>

      {/* Progress dots, same animated-fill-tied-to-SLIDE_DURATION pattern
          as Qula's ClientPhotoStrip. Only rendered past a single item --
          one announcement needs no progress indicator for a carousel of
          one. */}
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {announcements.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => handleDotClick(i)}
              aria-label={`Show ${a.title}`}
              className="group/dot relative flex h-4 items-center"
            >
              <span
                className={`relative block h-2 overflow-hidden rounded-full bg-border transition-all duration-300 ${
                  i === index ? "w-8" : "w-2 group-hover/dot:bg-muted-foreground"
                }`}
              >
                {i === index && (
                  <motion.span
                    key={`${a.id}-${index}`}
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
