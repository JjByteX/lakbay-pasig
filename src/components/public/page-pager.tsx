import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { Route, Routes, useLocation, useNavigate, type Location } from "react-router-dom";
import { Compass } from "@phosphor-icons/react";
import { EntryGate } from "@/lib/entry-gate";
import { setPageTitle } from "@/lib/page-title";
import { discoverResumeTarget, getDiscoverResumePath, isDiscoverDetailPath, rememberDiscoverPath } from "@/lib/discover-memory";
import TrailsPage from "@/pages/trails";
import DiscoverPage from "@/pages/discover";
import DiscoverPlaceDetailPage from "@/pages/discover-place-detail";
import DiscoverBusinessDetailPage from "@/pages/discover-business-detail";
import SavedPage from "@/pages/saved";

/**
 * Mobile swipe-to-switch-pages for Home, Trails, Discover and Saved, in the
 * same left-to-right order as the bottom nav, so swiping from Trails lands
 * on Discover instead of skipping past it. Rendered by MobileShell in place
 * of <Outlet /> on exactly these four routes; every other route still
 * renders through the Outlet as before.
 *
 * Discover is the one pane with two behaviours (see DiscoverPane). The map
 * and list screen registers its filter panel with the shell header and owns
 * a live map, so it mounts only while it is the current page and a drag
 * toward it shows a light placeholder instead of mounting the map
 * mid-gesture. A place or business page, on the other hand, is a plain
 * page: it is part of the swipe order (/discover/place/:id and
 * /discover/business/:id map to the Discover slot), it swipes like Trails
 * does, and when you swipe or tap to another page it stays open underneath
 * and comes back exactly as you left it. On Discover's map view the map
 * owns the swipe (data-swipe-owner, set in discover.tsx), so there is no
 * page swipe over the map; the list view and the bottom nav still move
 * between pages.
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

// null = Discover, rendered by DiscoverPane (it needs to know if it's current).
const PANES: readonly (ComponentType | null)[] = [EntryGate, TrailsPage, null, SavedPage];
const PATHS = ["/", "/trails", "/discover", "/saved"] as const;
const TITLES = [null, "Trails", "Discover", "Saved"] as const;
const LAST = PANES.length - 1;
const DISCOVER = 2;

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

// Drops every trailing slash by scanning back from the end. A /\/+$/ regex
// retries from each slash in a long run of them (super-linear), this is one pass.
function stripTrailingSlashes(pathname: string): string {
  let end = pathname.length;
  while (end > 0 && pathname[end - 1] === "/") end--;
  return pathname.slice(0, end);
}

/** Index of the pager page for a pathname, or -1 when the route isn't one. */
export function pagerIndexFor(pathname: string): number {
  const path = pathname.length > 1 ? stripTrailingSlashes(pathname) : pathname;
  if (isDiscoverDetailPath(path)) return DISCOVER;
  return (PATHS as readonly string[]).indexOf(path);
}

const restingTransform = (index: number) => `translate3d(${(-index * 100) / PANES.length}%, 0, 0)`;

const FORM_FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Whether this one element takes the horizontal gesture for itself: something
// typed into, a strip that overflows sideways right now, or a touch-action
// that takes over horizontal panning.
function elementOwnsGesture(node: HTMLElement): boolean {
  if (node.isContentEditable || FORM_FIELD_TAGS.has(node.tagName)) return true;
  const style = getComputedStyle(node);
  const scrollsX = style.overflowX === "auto" || style.overflowX === "scroll";
  if (scrollsX && node.scrollWidth > node.clientWidth + 1) return true;
  const touchAction = style.touchAction;
  return touchAction !== "auto" && touchAction !== "manipulation" && !touchAction.includes("pan-x");
}

function ownsHorizontalGesture(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && !node.hasAttribute(PANE_ATTR)) {
    if (node.hasAttribute(OWNER_ATTR)) return true;
    if (node instanceof HTMLElement && elementOwnsGesture(node)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * The Discover slot. It renders its own routes against a location it holds
 * on to, instead of the live one, so the page survives the user leaving:
 *
 *  - Current: it follows the real location (map, list, or a place/business
 *    page).
 *  - Not current, last on a place/business page: that page stays mounted
 *    with the location it had, so scroll position and loaded data are kept
 *    and swiping back lands on it as it was.
 *  - Not current, last on the map/list: a light placeholder, so the map
 *    unmounts (and clears its header filters) like it always has.
 *
 * What it last showed is also recorded in discover-memory.ts so the swipe
 * back (and the bottom nav's Discover tab) navigate to that page, not to
 * the bare map.
 */
function DiscoverPane({ active }: Readonly<{ active: boolean }>) {
  const location = useLocation();
  const held = useRef<Partial<Location> | string | null>(null);
  if (active) held.current = location;
  else if (held.current === null) held.current = getDiscoverResumePath();
  const heldPath = typeof held.current === "string" ? held.current : (held.current?.pathname ?? "/discover");

  const key = active ? `${location.pathname}${location.search}` : null;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (active) rememberDiscoverPath(`${location.pathname}${location.search}`);
  }, [active, location.pathname, location.search]);

  // A different place opened inside this pane starts at the top; coming
  // back to the same page (key unchanged) leaves the scroll where it was.
  useLayoutEffect(() => {
    if (key === null) return;
    if (lastKey.current !== null && lastKey.current !== key) {
      const scroller = wrapperRef.current?.parentElement;
      if (scroller) scroller.scrollTop = 0;
    }
    lastKey.current = key;
  }, [key]);

  const showContent = active || isDiscoverDetailPath(heldPath);
  return (
    <div ref={wrapperRef} className="h-full w-full">
      {showContent ? (
        <Routes location={held.current ?? undefined}>
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/discover/place/:id" element={<DiscoverPlaceDetailPage />} />
          <Route path="/discover/business/:id" element={<DiscoverBusinessDetailPage />} />
        </Routes>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Compass weight="bold" className="h-8 w-8" aria-hidden="true" />
        </div>
      )}
    </div>
  );
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

// Which way a drag is going once it has moved far enough to tell. "vertical"
// means a scroll, which the pager leaves alone.
function axisFor(dx: number, dy: number): "pending" | "horizontal" | "vertical" {
  if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return "pending";
  return Math.abs(dx) < Math.abs(dy) * AXIS_RATIO ? "vertical" : "horizontal";
}

// Finger speed in px per ms, from the last two touch points.
function trackVelocity(g: Gesture, clientX: number, timeStamp: number) {
  const dt = timeStamp - g.lastT;
  if (dt > 0) g.velocity = (clientX - g.lastX) / dt;
  g.lastX = clientX;
  g.lastT = timeStamp;
}

// The track's transform while dragging. Past Home or Saved it resists.
function dragTransform(i: number, dx: number): string {
  const atEdge = (i === 0 && dx > 0) || (i === LAST && dx < 0);
  const shown = atEdge ? dx * RUBBER_BAND : dx;
  return `translate3d(calc(${(-i * 100) / PANES.length}% + ${shown}px), 0, 0)`;
}

export function PagePager({ index }: Readonly<{ index: number }>) {
  const navigate = useNavigate();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  const [mounted, setMounted] = useState<number[]>([index]);
  const isMounted = (i: number) => i === index || mounted.includes(i);
  const paneContent = (Pane: ComponentType | null, i: number) => {
    if (Pane === null) return <DiscoverPane active={i === index} />;
    return isMounted(i) ? <Pane /> : null;
  };

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

    // Mounts the page being dragged toward, once per direction.
    const reveal = (g: Gesture, i: number, dir: number) => {
      if (dir === g.revealed) return;
      g.revealed = dir;
      if (i + dir >= 0 && i + dir <= LAST) {
        setMounted((prev) => (prev.includes(i + dir) ? prev : [...prev, i + dir]));
      }
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture;
      if (!g) return;
      if (e.touches.length !== 1) {
        if (g.axis === "horizontal") settle(indexRef.current);
        gesture = null;
        return;
      }
      const touch = e.touches[0];
      const dx = touch.clientX - g.startX;

      if (g.axis === "pending") {
        const axis = axisFor(dx, touch.clientY - g.startY);
        if (axis === "pending") return;
        if (axis === "vertical") {
          gesture = null; // a vertical scroll, leave it alone
          return;
        }
        g.axis = "horizontal";
        track.style.transition = "none";
      }

      const i = indexRef.current;
      reveal(g, i, dx < 0 ? 1 : -1);
      trackVelocity(g, touch.clientX, e.timeStamp);
      g.dx = dx;
      track.style.transform = dragTransform(i, dx);
    };

    const onEnd = (e: TouchEvent) => {
      const g = gesture;
      gesture = null;
      if (g?.axis !== "horizontal") return;
      const i = indexRef.current;
      const next = i + (g.dx < 0 ? 1 : -1);
      const farEnough = Math.abs(g.dx) > viewport.clientWidth * COMMIT_RATIO;
      const flicked = Math.abs(g.velocity) > COMMIT_VELOCITY && Math.sign(g.velocity) === Math.sign(g.dx);
      const commit = e.type === "touchend" && next >= 0 && next <= LAST && (farEnough || flicked);
      settle(commit ? next : i);
      if (commit) {
        // Discover reopens whichever of its pages was left open.
        if (next === DISCOVER) {
          const target = discoverResumeTarget();
          navigate(target.to, { state: target.state });
        } else {
          navigate(PATHS[next]);
        }
      }
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
        className="flex h-full transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${PANES.length * 100}%`, transform: restingTransform(index) }}
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
            className="h-full shrink-0 overflow-y-auto [scrollbar-gutter:stable]"
            style={{ width: `${100 / PANES.length}%` }}
          >
            {paneContent(Pane, i)}
          </div>
        ))}
      </div>
    </div>
  );
}
