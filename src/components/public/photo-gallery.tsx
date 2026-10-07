import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CaretLeft, CaretRight, CornersOut, X, MagnifyingGlassPlus, MagnifyingGlassMinus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { loopIndex } from "@/lib/filmstrip";
import { cn } from "@/lib/utils";

// Average colour per photo, drawn onto a 24x24 canvas and cached for the
// page's lifetime so switching photos never waits (same approach as the
// Qula portfolio modal). Resolves null when the canvas is tainted (image
// host without CORS headers) or the image fails; the frame then falls back
// to bg-muted. Mostly transparent pixels are skipped so a transparent PNG
// logo doesn't average toward black.
const colorCache = new Map<string, Promise<string | null>>();

function averageColor(src: string): Promise<string | null> {
  let hit = colorCache.get(src);
  if (!hit) {
    hit = new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 24;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(image, 0, 0, 24, 24);
          const { data } = ctx.getImageData(0, 0, 24, 24);
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n++;
          }
          resolve(n ? `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})` : null);
        } catch {
          resolve(null);
        }
      };
      image.onerror = () => resolve(null);
      image.src = src;
    });
    colorCache.set(src, hit);
  }
  return hit;
}

function useAverageColor(src: string | undefined) {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    let live = true;
    void averageColor(src).then((c) => live && setColor(c));
    return () => {
      live = false;
    };
  }, [src]);
  return color;
}

// Buttons drawn on top of a photo show only while a pointer or finger is
// moving over it, then fade out so they never cover the picture. Hidden
// buttons ignore pointer events (a tap on the photo must not hit an
// invisible button) but stay reachable and visible by keyboard focus.
const IDLE_MS = 2000;

function useIdleControls() {
  const [awake, setAwake] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAwake(false), IDLE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const controlClass = cn(
    "transition-opacity duration-200",
    awake ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0 focus-visible:opacity-100",
  );
  return { wake, controlClass };
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
const DOUBLE_TAP_ZOOM = 2.5;
// Swipe to change photo (touch only, at 1x zoom): a drag past SWIPE_DISTANCE
// commits, and so does a quick flick past the shorter SWIPE_FLICK_DISTANCE.
const SWIPE_DISTANCE = 64;
const SWIPE_FLICK_DISTANCE = 24;
const SWIPE_FLICK_MS = 250;

// Full-screen zoom/pan surface. Only mounted while the viewer is open, so
// zoom and offset reset on every open for free. No library: wheel and the
// +/- buttons zoom, double-click toggles, drag pans once zoomed in, two
// fingers pinch. Zoom is about the centre; pan is clamped so the photo
// can't be dragged out of view. When onSwipe is given, a one-finger
// horizontal drag at 1x zoom moves the photo with the finger and, on
// release, either changes photo (swipe left = next) or springs back. Touch
// only, so a mouse drag never changes photo. Zoomed in, a drag pans instead.
function ZoomStage({
  src,
  controlClass,
  onSwipe,
}: Readonly<{ src: string; controlClass: string; onSwipe?: (by: number) => void }>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const [scale, setScale] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  function clamp(o: { x: number; y: number }, s: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return o;
    const maxX = ((s - 1) * rect.width) / 2;
    const maxY = ((s - 1) * rect.height) / 2;
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  }

  function zoomTo(next: number) {
    const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    setScale(s);
    setOffset((o) => (s === MIN_ZOOM ? { x: 0, y: 0 } : clamp(o, s)));
  }

  // The stage is keyed by photo, so this runs for every new photo: a short
  // fade in softens the cut after a swipe, tap on a thumbnail or arrow.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    imgRef.current?.animate({ opacity: [0, 1] }, { duration: 200, easing: "ease-out" });
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    // A swipe is one finger only. A second finger turns it into a pinch.
    swipe.current =
      onSwipe && pointers.current.size === 1 && e.pointerType !== "mouse"
        ? { x: e.clientX, y: e.clientY, t: e.timeStamp }
        : null;
    if (pointers.current.size === 2) {
      setOffset({ x: 0, y: 0 });
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo((pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist);
    } else if (pointers.current.size === 1 && scale > MIN_ZOOM) {
      setOffset((o) => clamp({ x: o.x + e.clientX - prev.x, y: o.y + e.clientY - prev.y }, scale));
    } else if (pointers.current.size === 1 && swipe.current) {
      setOffset({ x: e.clientX - swipe.current.x, y: 0 });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    swipe.current = null;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    setDragging(pointers.current.size > 0);
    if (!start || !onSwipe || scale > MIN_ZOOM) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const flick = e.timeStamp - start.t < SWIPE_FLICK_MS && Math.abs(dx) > SWIPE_FLICK_DISTANCE;
    if (e.type === "pointerup" && Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > SWIPE_DISTANCE || flick)) {
      onSwipe(dx < 0 ? 1 : -1);
    } else {
      // Not far enough (or cancelled): the photo springs back to centre.
      setOffset({ x: 0, y: 0 });
    }
  }

  return (
    <>
      <div
        ref={stageRef}
        className={cn(
          "absolute inset-0 touch-none select-none overflow-hidden",
          scale > MIN_ZOOM && (dragging ? "cursor-grabbing" : "cursor-grab"),
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => zoomTo(scale - e.deltaY * 0.005)}
        onDoubleClick={() => zoomTo(scale > MIN_ZOOM ? MIN_ZOOM : DOUBLE_TAP_ZOOM)}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          className={cn("h-full w-full object-contain", !dragging && "transition-transform duration-200")}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-2 max-md:hidden">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => zoomTo(scale - ZOOM_STEP)}
          disabled={scale <= MIN_ZOOM}
          aria-label="Zoom out"
          className={controlClass}
        >
          <MagnifyingGlassMinus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => zoomTo(scale + ZOOM_STEP)}
          disabled={scale >= MAX_ZOOM}
          aria-label="Zoom in"
          className={controlClass}
        >
          <MagnifyingGlassPlus className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

// Thumbnail strip along the bottom of the full-screen viewer, so every photo
// is visible and one tap away. Unlike the buttons over the photo it never
// fades out. It is its own component so it mounts with the viewer's content
// and can centre the current thumbnail on open and on every prev/next or
// arrow key, not just on a thumbnail tap. The current one is full strength
// with a solid border, the rest are dimmed (Apple Photos convention).
function ThumbStrip({
  photoUrls,
  index,
  onSelect,
}: Readonly<{ photoUrls: string[]; index: number; onSelect: (index: number) => void }>) {
  const active = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    active.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [index]);

  return (
    <div className="absolute inset-x-0 bottom-0 h-24 overflow-x-auto">
      {/* w-max with min-w-full: centred while the thumbnails fit, scrolls
          from the left edge once they don't. */}
      <div className="flex h-full w-max min-w-full items-center justify-center gap-2 px-4">
        {photoUrls.map((url, i) => (
          <button
            key={`${url}-${i}`}
            ref={i === index ? active : undefined}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Show photo ${i + 1} of ${photoUrls.length}`}
            aria-current={i === index}
            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
          >
            <img
              src={url}
              alt=""
              draggable={false}
              className={cn(
                "h-16 w-16 rounded-md object-cover transition-opacity duration-200",
                i === index
                  ? "border-2 border-background"
                  : "border border-background/40 opacity-60 hover:opacity-100",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// Same Radix Dialog the rest of the app uses (focus trap, Escape, scroll
// lock, focus returns to the button that opened it), styled full screen
// instead of the centred card. The backdrop takes the photo's average
// colour, same as the frame on the page behind it, and prev/next step
// through the gallery (wrapping at the ends, arrow keys work too). Every
// button over the photo fades out while nothing is moving. With more than
// one photo the bottom 96px is reserved for a thumbnail strip that stays
// visible, and the photo, its arrows and the zoom buttons sit above it.
// Below md (phones) the arrows and zoom buttons are hidden: pinch and
// double-tap zoom, swiping the photo or tapping a thumbnail switches photos,
// so only Close is left over the photo.
function PhotoViewer({
  photoUrls,
  index,
  onIndexChange,
  open,
  onOpenChange,
}: Readonly<{
  photoUrls: string[];
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const src = photoUrls[index];
  const color = useAverageColor(src);
  const { wake, controlClass } = useIdleControls();
  const many = photoUrls.length > 1;
  const step = (by: number) => onIndexChange(loopIndex(index + by, photoUrls.length));

  // Show the buttons on open so the close button can be found.
  useEffect(() => {
    if (open) wake();
  }, [open, wake]);

  function onKeyDown(e: ReactKeyboardEvent) {
    wake();
    if (!many) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-foreground/90" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onPointerMove={wake}
          onPointerDown={wake}
          className="fixed inset-0 z-50 text-background outline-none transition-colors duration-500"
          style={{ backgroundColor: color ?? undefined }}
        >
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {/* Photo area. Stops 96px short of the bottom when the thumbnail
              strip is showing, so the arrows centre on the photo and the
              zoom buttons (bottom-4 of this box) clear the strip. */}
          <div className={cn("absolute inset-x-0 top-0", many ? "bottom-24" : "bottom-0")}>
            {/* Keyed by photo so zoom and pan reset on every prev/next. */}
            <ZoomStage key={index} src={src} controlClass={controlClass} onSwipe={many ? step : undefined} />
            {many && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => step(-1)}
                  aria-label="Previous photo"
                  className={cn("absolute left-4 top-1/2 -translate-y-1/2 max-md:hidden", controlClass)}
                >
                  <CaretLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => step(1)}
                  aria-label="Next photo"
                  className={cn("absolute right-4 top-1/2 -translate-y-1/2 max-md:hidden", controlClass)}
                >
                  <CaretRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          {many && <ThumbStrip photoUrls={photoUrls} index={index} onSelect={onIndexChange} />}
          <DialogClose asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Close"
              className={cn("absolute right-4 top-4", controlClass)}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

/**
 * Map hover/full-details photos phase: a plain horizontal photo strip for
 * a place/business detail page's own uploaded photos (place_photos /
 * business_photos), reached from result-card.tsx's "View full details"
 * link per direct instruction ("When view full details, show picture(s)
 * that are uploaded by the place/business in details"). Shared by
 * discover-place-detail.tsx and discover-business-detail.tsx rather than
 * two near-identical strips, since both pages need the exact same shape:
 * an ordered list of photo URLs, one large photo (the first until a
 * thumbnail is clicked), all of them as a scrollable clickable strip
 * beneath it when there is more than one. A button on the main photo
 * opens it full screen (PhotoViewer) with zoom, drag-to-pan and prev/next.
 * The full-screen button only shows while the photo is hovered (or the
 * button has keyboard focus), so it never sits on top of the picture; the
 * controls inside the viewer show only while the pointer is moving, but its
 * thumbnail strip along the bottom is always visible.
 *
 * Same native horizontal-scroll pattern category-photo-row.tsx's own Home
 * showcase strip already established for this codebase (-mx-6 flex gap-3
 * overflow-x-auto px-6, bleeding the strip to the page's full width while
 * the rest of the page keeps its normal padding) -- no new carousel
 * library, confirmed none exists here already (that file's own Phase 3.1
 * comment).
 *
 * Renders nothing when the list is empty: an empty gallery block has
 * nothing useful to say beyond what the page's own "No details listed
 * yet" (or equivalent) message already covers elsewhere, so this adds no
 * empty-state message of its own -- the caller simply doesn't get a
 * gallery section for a place/business with no uploaded photos yet.
 */
export function PhotoGallery({ photoUrls, className }: Readonly<{ photoUrls: string[]; className?: string }>) {
  const [selected, setSelected] = useState(0);
  const [viewing, setViewing] = useState(false);

  // Clamp: the same instance can outlive a photo list change (navigating
  // between two places reuses this page's component).
  const current = photoUrls[selected] ?? photoUrls[0];
  const index = photoUrls[selected] ? selected : 0;
  const color = useAverageColor(current);

  // Warm the cache for every photo so a thumbnail click never flashes.
  useEffect(() => {
    photoUrls.forEach(averageColor);
  }, [photoUrls]);

  if (photoUrls.length === 0) return null;

  return (
    // xl+: place/business detail sits this in the right-hand 22rem column of
    // its grid, so the edge-to-edge bleed (-mx-6 / px-6) is dropped and the
    // main photo gets the card radius instead. Below xl nothing changes.
    <div className={cn("-mx-6 flex flex-col gap-2 xl:mx-0", className)}>
      {/* Fit to container, not cropped: the frame takes the photo's
          average colour, so a logo or a portrait photo never gets cut off
          and the bars around it read as part of the photo. */}
      <div
        className="group relative aspect-[4/3] w-full overflow-hidden bg-muted transition-colors duration-500 xl:rounded-lg"
        style={{ backgroundColor: color ?? undefined }}
      >
        <img src={current} alt="" className="h-full w-full object-contain" />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => setViewing(true)}
          aria-label="View full screen"
          title="View full screen"
          className="pointer-events-none absolute bottom-2 right-2 opacity-0 transition-opacity duration-200 focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
        >
          <CornersOut className="h-4 w-4" />
        </Button>
      </div>
      <PhotoViewer
        photoUrls={photoUrls}
        index={index}
        onIndexChange={setSelected}
        open={viewing}
        onOpenChange={setViewing}
      />
      {/* Thumbnails swap the main photo (product-page convention: Amazon,
          Etsy). Every photo is listed, the selected one marked with a full
          primary border. A single photo has nothing to switch to. */}
      {photoUrls.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-6 pb-1 xl:px-0">
          {photoUrls.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`Show photo ${index + 1} of ${photoUrls.length}`}
              aria-current={url === current}
              className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <img
                src={url}
                alt=""
                className={cn(
                  "h-20 w-20 rounded-md border object-cover",
                  url === current ? "border-2 border-primary" : "border-border hover:border-foreground",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
