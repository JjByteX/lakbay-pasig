import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EntryGate } from "@/lib/entry-gate";
import { setPageTitle } from "@/lib/page-title";
import TrailsPage from "@/pages/trails";
import SavedPage from "@/pages/saved";

/**
 * Mobile swipe-to-switch-pages for Home, Trails and Saved (Discover is not
 * part of the swipe order). Rendered by MobileShell in place of <Outlet />
 * on exactly these three routes; every other route still renders through
 * the Outlet as before.
 *
 * Remembering: each page lives in its own pane with its own vertical
 * scroller, and a pane stays mounted once it has been shown, so scroll
 * position, Saved's selected tab and loaded data survive swiping away and
 * back. A pane is mounted the first time it is shown or the moment a drag
 * toward it begins, not all at once, so Trails/Saved don't fetch until
 * they're needed and Home's EntryGate redirect behaves exactly as when
 * tapping the Home tab.
 *
 * Gesture ownership: whoever's element the finger lands on owns the
 * gesture. A touch that starts on plain space pages; a touch that starts
 * on something that can actually move sideways right now does not.
 * "Can move sideways" is detected, not listed (see ownsHorizontalGesture):
 * a horizontally scrollable element that overflows, an element whose
 * touch-action takes over horizontal panning (the hero carousel's
 * touch-pan-y), a form field, or anything marked data-swipe-owner (the
 * escape hatch for odd cases). A strip that fits on screen has nothing to
 * scroll, so it hands the swipe to the page. The strip's own end is a hard
 * stop: the page never takes over mid-gesture.
 *
 * No looping: Home and Saved are hard stops with a rubber-band.
 */

const PANES = [EntryGate, TrailsPage, SavedPage] as const;
const PATHS = ["/", "/trails", "/saved"] as const;
const TITLES = [null, "Trails", "Saved"] as const;
const LAST = PANES.length - 1;

// Marker for a component that handles its own horizontal touch but that the
// detection below can't see.
const OWNER_ATTR = "data-swipe-owner";
const PANE_ATTR = "data-pager-pane";

// Ignore touches starting this close to either screen edge so the iOS
// back-swipe and Android gesture navigation keep working.
const EDGE_PX = 20;
// Movement before the gesture's axis is decided. Taps and tiny jitters never
// reach it, so a tap is unaffected.
const LOCK_PX = 10;
// Horizontal must clearly beat vertical, so a diagonal scroll stays a scroll.
const AXIS_RATIO = 1.5;
// Commit when dragged past this share of the width, or flicked fast enough.
const COMMIT_RATIO = 0.25;
const COMMIT_VELOCITY = 0.45; // px per ms
// Dragging past Home or Saved resists instead of following the finger.
const RUBBER_BAND = 0.25;

/** Index of the pager page for a pathname, or -1 when the route isn't one. */
export function pagerIndexFor(pathname: string): number {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (PATHS as readonly string[]).indexOf(path);
}

const restingTransform = (index: number) => `translate3d(${(-index * 100) / PANES.length}%, 0, 0)`;

function ownsHorizontalGesture(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && !node.hasAttribute(PANE_ATTR)) {
    if (node.hasAttribute(OWNER_ATTR)) return true;
    if (node instanceof HTMLElement) {
      if (node.isContentEditable) return true;
      if (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT") return true;
      const style = getComputedStyle(node);
      const scrollsX = style.overflowX === "auto" || style.overflowX === "scroll";
      if (scrollsX && node.scrollWidth > node.clientWidth + 1) return true;
      const touchAction = style.touchAction;
      if (touchAction !== "auto" && touchAction !== "manipulation" && !touchAction.includes("pan-x")) return true;
    }
    node = node.parentElement;
  }
  return false;
}

interface Gesture {
  startX: number;
  startY: number;
  axis: "pending" | "horizontal";
  dx: number;
  lastX: number;
  lastT: number;
  velocity: number;
  revealed: number;
}

export function PagePager({ index }: Readonly<{ index: number }>) {
  const navigate = useNavigate();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  const [mounted, setMounted] = useState<number[]>([index]);
  const isMounted = (i: number) => i === index || mounted.includes(i);

  // Title follows the visible page. Runs after child effects in the same
  // commit, so a pane mounted early by a drag that then cancels can't leave
  // its own title behind.
  useEffect(() => {
    setPageTitle(TITLES[index]);
  }, [index, mounted]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    let gesture: Gesture | null = null;

    // Drag is written straight to the DOM, not through React state, so a
    // finger move never re-renders the three pages.
    const settle = (finalIndex: number) => {
      track.style.transition = "";
      track.style.transform = restingTransform(finalIndex);
    };

    const onStart = (e: TouchEvent) => {
      gesture = null;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (touch.clientX < EDGE_PX || touch.clientX > window.innerWidth - EDGE_PX) return;
      if (ownsHorizontalGesture(e.target)) return;
      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        axis: "pending",
        dx: 0,
        lastX: touch.clientX,
        lastT: e.timeStamp,
        velocity: 0,
        revealed: 0,
      };
    };

    const onMove = (e: TouchEvent) => {
      if (!gesture) return;
      if (e.touches.length !== 1) {
        if (gesture.axis === "horizontal") settle(indexRef.current);
        gesture = null;
        return;
      }
      const touch = e.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;

      if (gesture.axis === "pending") {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        if (Math.abs(dx) < Math.abs(dy) * AXIS_RATIO) {
          gesture = null; // a vertical scroll, leave it alone
          return;
        }
        gesture.axis = "horizontal";
        track.style.transition = "none";
      }

      const i = indexRef.current;
      const dir = dx < 0 ? 1 : -1;
      if (dir !== gesture.revealed) {
        gesture.revealed = dir;
        if (i + dir >= 0 && i + dir <= LAST) {
          setMounted((prev) => (prev.includes(i + dir) ? prev : [...prev, i + dir]));
        }
      }

      const dt = e.timeStamp - gesture.lastT;
      if (dt > 0) gesture.velocity = (touch.clientX - gesture.lastX) / dt;
      gesture.lastX = touch.clientX;
      gesture.lastT = e.timeStamp;
      gesture.dx = dx;

      const atEdge = (i === 0 && dx > 0) || (i === LAST && dx < 0);
      const shown = atEdge ? dx * RUBBER_BAND : dx;
      track.style.transform = `translate3d(calc(${(-i * 100) / PANES.length}% + ${shown}px), 0, 0)`;
    };

    const onEnd = (e: TouchEvent) => {
      const g = gesture;
      gesture = null;
      if (!g || g.axis !== "horizontal") return;
      const i = indexRef.current;
      const next = i + (g.dx < 0 ? 1 : -1);
      const farEnough = Math.abs(g.dx) > viewport.clientWidth * COMMIT_RATIO;
      const flicked = Math.abs(g.velocity) > COMMIT_VELOCITY && Math.sign(g.velocity) === Math.sign(g.dx);
      const commit = e.type === "touchend" && next >= 0 && next <= LAST && (farEnough || flicked);
      settle(commit ? next : i);
      if (commit) navigate(PATHS[next]);
    };

    viewport.addEventListener("touchstart", onStart, { passive: true });
    viewport.addEventListener("touchmove", onMove, { passive: true });
    viewport.addEventListener("touchend", onEnd, { passive: true });
    viewport.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      viewport.removeEventListener("touchstart", onStart);
      viewport.removeEventListener("touchmove", onMove);
      viewport.removeEventListener("touchend", onEnd);
      viewport.removeEventListener("touchcancel", onEnd);
    };
  }, [navigate]);

  return (
    <div ref={viewportRef} className="h-full w-full overflow-hidden">
      <div
        ref={trackRef}
        className="flex h-full w-[300%] transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: restingTransform(index) }}
      >
        {PANES.map((Pane, i) => (
          <div
            key={PATHS[i]}
            data-pager-pane=""
            aria-hidden={i !== index}
            ref={(el) => {
              // inert: an off-screen pane can't take focus or taps. Set as a
              // property because React 18 has no inert prop.
              if (el) el.inert = i !== index;
            }}
            className="h-full w-1/3 shrink-0 overflow-y-auto [scrollbar-gutter:stable]"
          >
            {isMounted(i) ? <Pane /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
