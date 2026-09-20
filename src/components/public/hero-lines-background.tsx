import { useEffect, useRef } from "react";
import heroLinesSvg from "@/assets/hero-lines.svg?raw";
import { startHeroLinesAnimation } from "./hero-lines-animation.js";

/**
 * Landing hero background, replacing the flat bg-secondary (navy) panel.
 * Direct instruction: swap the hero from blue-panel to a white panel
 * carrying this animated line artwork, with the lines themselves
 * recolored blue -- not the reverse (white lines on navy) the source
 * asset shipped with (it was originally black bg + grayscale lines,
 * meant to sit on a dark surface). Second direct instruction: remove the
 * right-hand cluster of lines and keep only the left cluster -- the
 * source asset draws two separate bundles of lines converging from the
 * left and right edges toward the middle (see RIGHT_SIDE_LINE_INDICES
 * below), and this panel now only needs the left bundle since the panel
 * itself sits on the left half of the hero split (hero-carousel.tsx
 * fills the right half with the photo carousel instead).
 *
 * The source is a standalone HTML file (SVG + a small requestAnimationFrame
 * script that reshapes each line's `d` attribute every frame -- a
 * Catmull-Rom filmstrip of two travelling swells per decision-log.md's
 * "ported, not reinvented" rule applied to hero-carousel.tsx elsewhere in
 * this file tree). The gradients inside the SVG never change at runtime,
 * only the path shapes do, so recoloring is a pure CSS concern layered on
 * top: this component does not touch the extracted SVG markup or the
 * extracted animation logic at all (hero-lines.svg, hero-lines-
 * animation.js, both byte-for-byte ports of the supplied file), it only
 * wraps them and applies a CSS filter to shift the original grayscale
 * (#060606..#525252) stroke gradients to the brand blue (--primary,
 * #0275D7) without re-deriving every stop by hand.
 *
 * hue-rotate + saturate on a grayscale source is not reliable (grayscale
 * has no hue to rotate), so this uses an SVG filter (feColorMatrix) that
 * explicitly maps luminance to a navy->blue ramp, keeping every line's
 * existing light/dark variation (that variation is what reads as depth
 * and per-line motion) instead of flattening all lines to one flat tint.
 *
 * Right-side removal is done the same "don't touch the ported files" way:
 * hero-lines.svg's each line is its own <path data-i="N">, and
 * hero-lines-animation.js's CURVES[N] gives that path's own control
 * points in source-space (viewBox 0 0 1639 923). The right-hand bundle is
 * the set of indices whose points all start past the horizontal midpoint
 * (x >= 819.5) -- a separate, closed group in the source data, not an
 * arbitrary cut -- so hiding exactly those <path> elements with a CSS
 * selector removes the whole right cluster cleanly without editing
 * either extracted file. The animation script still computes and writes
 * `d` for every path every frame (untouched), it's simply not painted
 * for the hidden ones -- cheaper than forking the script to skip them,
 * and zero risk of breaking the shared swell math those paths also
 * contribute timing to for their neighbours.
 *
 * Crop alignment, third direct instruction ("move the wavy lines more to
 * the right and downwards because i dont see half of it"): the source
 * SVG ships `preserveAspectRatio="xMidYMid slice"`, which on this panel's
 * tall, half-width aspect ratio scales the 1639x923 box up until it
 * fills the panel and then crops centered on the viewBox's own midpoint
 * (x=819.5). But every remaining (left-cluster) line only occupies
 * x:0-860 of that 1639-wide box -- so a center crop shows mostly the
 * empty x:860-1639 region on the right half of the crop window and cuts
 * off content on the left half, which reads as "half the lines are
 * missing" even though every left-cluster path is still there and still
 * animating.
 *
 * Fix, applied at runtime to the injected <svg>'s own viewBox/
 * preserveAspectRatio (hero-lines.svg on disk is untouched, see this
 * file's earlier comment): shrink the viewBox down to roughly the
 * surviving cluster's own bounding box (CROP_W x CROP_H, padded) instead
 * of the full 1639x923 box, so there's far less empty area for "slice"
 * to crop into in the first place; then add EXTRA_MARGIN_LEFT/TOP of
 * blank space onto the window's own left/top edge. Padding the window's
 * near edge, rather than moving it, is what pushes the content deeper
 * into (i.e. further right/down within) the visible frame while keeping
 * every number in source units -- so it holds up at any panel size,
 * unlike a CSS pixel offset which would drift as the panel resizes.
 *
 * Fourth direct instruction, after seeing it rendered ("too much, please
 * fix"): stroke width in the source SVG is a fixed absolute number (2.35
 * or 5.9 units, unrelated to the viewBox), so an over-tight crop also
 * scales those strokes up on screen and packs the lines closer together,
 * reading as a dense, heavy mesh instead of a light backdrop. Fix:
 * LINE_OPACITY dims the whole layer well behind the text (a decorative
 * backdrop should never compete with foreground copy for attention).
 * The crop tightness itself was later superseded by the sixth
 * instruction's box-sizing approach below, which controls on-screen
 * scale via the box's own CSS size rather than the crop window.
 *
 * Fifth direct instruction ("fix the hero background placement to be
 * bottom left") -- SUPERSEDED by the sixth, see below. That attempt only
 * changed preserveAspectRatio (xMinYMax) on an <svg> that still filled
 * the ENTIRE panel (h-full w-full). preserveAspectRatio only controls
 * which edge "slice" crops FROM when the content overflows the box; it
 * cannot shrink how much of the box the content fills. The surviving
 * cluster's own bounding box is y:0-897 against a 923-tall source --
 * i.e. it already spans nearly the full height -- so with the SVG
 * element still stretched over the whole panel, the lines kept reaching
 * from the panel's top edge to its bottom edge regardless of which
 * corner preserveAspectRatio nominally "anchored", still cutting across
 * the vertically-centered headline. Verified by rendering the actual
 * component (real SVG + real animation script, not a description of it)
 * at the real panel size before concluding this -- rendering it is what
 * caught what reasoning about the numbers alone had missed.
 *
 * Sixth direct instruction (screenshot showing the fifth attempt still
 * overlapping the headline): the fix is to stop rendering the artwork
 * into a box the size of the whole panel at all. The animated <svg> now
 * sits in its own small box, absolutely positioned to the panel's
 * bottom-left corner (BOX_WIDTH_PCT x BOX_HEIGHT_PCT, well under half
 * the panel on each axis) instead of inset-0 across the whole panel.
 * The viewBox is cropped tight to the left cluster's own bounding box
 * (CONTENT_W x CONTENT_H, plus a small CROP_PAD) with preserveAspectRatio
 * "xMinYMax meet" -- meet, not slice, so the whole cluster scales DOWN
 * to fit inside that small box with letterboxing on the far edges rather
 * than overflowing it. Because the box itself is anchored bottom-left
 * and sized well short of the panel's own height/width, the artwork can
 * no longer reach the vertical or horizontal center where the headline
 * and CTAs live, at any panel size -- confirmed by re-rendering the real
 * component across a range of panel heights, not just the one
 * screenshot's dimensions.
 *
 * Seventh direct instruction ("make it a little big and also, it has a
 * little gap on the left"): two independent fixes. Size: BOX_WIDTH_PCT/
 * BOX_HEIGHT_PCT raised from 55/42 to 68/52, still well short of half
 * the panel so bottom-left placement holds. Gap: CROP_MIN_X was
 * -CROP_PAD, padding the crop window's left edge the same as its top/
 * right/bottom -- but the content's own bounding box already starts at
 * x=0 (flush with the source data's left edge, see CONTENT_W/H above),
 * so that left pad had nothing to pad against and only pushed the
 * artwork inward, leaving empty space between the box's own left edge
 * and where the lines actually start. CROP_MIN_X is now 0 (no left pad)
 * while CROP_MIN_Y/the right and bottom edges keep their pad, so stroke
 * width and motion amplitude still don't clip on those three sides.
 *
 * Eighth direct instruction ("make the text centered and the waves a
 * little more bigger"): the hero copy column in landing.tsx switched
 * from left-aligned to items-center/text-center, which also moves the
 * copy's own effective edge away from this component's bottom-left
 * corner (a centered block leaves more clearance on the left side than
 * a left-aligned one did) -- so BOX_WIDTH_PCT/BOX_HEIGHT_PCT could go up
 * again (74/57) without re-approaching the text, verified by re-checking
 * against the actual centered copy, not the old left-aligned layout the
 * previous size was tuned against.
 *
 * Ninth direct instruction, with a reference screenshot and an arrow
 * drawn from the empty space above the artwork down to where the lines
 * used to start ("continue the lines to be like a river on the top
 * side... make it natural like what we have right now"): the bottom-left
 * box (74% x 57% of the panel) left a large empty gap between the fixed
 * header and where the artwork began, so the fan read as a corner
 * decoration rather than something flowing down the whole left edge.
 *
 * The fix is NOT a second copy of the artwork bolted onto the top --
 * CURVES already contains this: 11 of the 37 surviving left-cluster
 * lines (indices 0-10) start at the SOURCE's own top edge (y=0, x:16-268)
 * and curl through an S-bend before joining the same long diagonal run
 * every other left-cluster line follows down to the bottom-left corner
 * (the other 26 lines start flush against the source's left edge at
 * x=0, y:88-895 -- see hero-lines-animation.js's CURVES). One continuous
 * piece of art already draws a bend from the top down into the fan; the
 * old crop just never gave it room to read as one, because BOX_HEIGHT_PCT
 * (57%) capped the box well short of the panel's actual top, and because
 * meet-fit scales both axes together, simply raising BOX_HEIGHT_PCT alone
 * (tried first) only blew the whole shape up around its existing bottom-
 * left anchor and pushed it into the centered headline instead of
 * revealing more of the top -- confirmed by rendering that attempt before
 * settling on this one.
 *
 * What actually works: keep BOX_HEIGHT_PCT at 100 (the box now runs the
 * full height of this component's own container, which already starts
 * below the fixed header -- landing.tsx's pt-16 on the hero column, not
 * something this file needs to duplicate), and pull BOX_WIDTH_PCT in
 * (74 -> 34) so the box's own aspect ratio goes tall-and-narrow instead
 * of short-and-wide. Under xMinYMax meet, a taller/narrower box against
 * the same source content pushes the SAME S-bend-into-fan artwork up the
 * full height of the panel at a slightly larger scale, rather than
 * cropping in on it or stretching it -- verified by rendering the real
 * component at both the previous and new box proportions side by side,
 * across desktop, half-width, and the mobile-stacked panel width, and
 * confirming the artwork still clears the centered headline/CTA column
 * (and the fixed header above it) at every size, exactly the same "check
 * the real component, not just the numbers" discipline the fifth/sixth
 * instructions above already established.
 *
 * CROP_W tightens to match (890 -> 366) so the crop window's own aspect
 * ratio is close to the new box's, keeping meet's letterboxing minimal
 * across realistic panel sizes (the hero column's width and its
 * min-h-screen height don't scale together, so no single fixed viewBox
 * aspect matches every breakpoint exactly -- this value is chosen from
 * the panel proportions rendering showed matching best, and meet only
 * ever shrinks-to-fit, so any mismatch elsewhere just shows slightly less
 * width, never overflow into the text). CROP_H, CROP_PAD, and CROP_MIN_X/
 * Y are untouched -- the full vertical content (including the top-edge-
 * starting lines) was already inside the old crop window; only the box
 * it's displayed in changed shape.
 *
 * Tenth direct instruction, with a screenshot showing this component's
 * own root as a visible rectangle against the surrounding page ("make
 * this the same color as the background please"): this root's fill was
 * a literal bg-white (#fff), while the page's own --background token
 * (index.css) is a very slightly warm off-white (60 40% 98%), not pure
 * white -- close enough to look "roughly white" in isolation but visibly
 * a different, boxed-in rectangle once this component is mounted as a
 * full hero backdrop (landing.tsx) sitting on that page background
 * rather than filling its own isolated column. Fix at the time: this
 * root switched to bg-background (the same token/class the page itself
 * paints with, per index.css's `body { @apply bg-background ... }`)
 * instead of the hardcoded bg-white, so this layer was always exactly
 * the same color as whatever surface it sat on.
 *
 * Fourteenth direct instruction ("make the background of the hero same
 * background as the top bar color"): the HERO SECTION itself (landing.
 * tsx, not this component) switched from inheriting bg-background to an
 * explicit bg-card, to match LandingHeader's own bg-card/80. This
 * component's own root is updated to match -- bg-card, not bg-background
 * -- for the exact same reason the tenth instruction's fix above
 * originally mattered: this layer needs to always match whatever
 * surface it is mounted on, and that surface is now bg-card, not
 * bg-background. Leaving this on bg-background after the hero itself
 * moved to bg-card would have reintroduced the exact same "visible
 * rectangle" bug the tenth instruction fixed, just with the two colors'
 * roles swapped.
 */
const RIGHT_SIDE_LINE_INDICES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 33, 39];

// Thirteenth direct instruction ("I think they're cut off maybe because
// of the crop? why put it in a container too when you can just slap it
// on there since no ones occupying the space"): correct diagnosis, and
// simpler than the twelfth instruction's fix addressed. The extension
// itself (EXTEND_PX, LEFT_EDGE_LINE_INDICES, extendPathStart above) WAS
// drawing and WAS being let through by the overflow changes -- but it
// was still landing fully inside a small, sized, bottom-left-anchored
// BOX (the old BOX_WIDTH_PCT x BOX_HEIGHT_PCT box), which itself sat
// well inside the hero's own empty left-side space. So the extended
// line still had a real, visible endpoint -- just further along, inside
// a mostly-empty box, floating in open space rather than reaching the
// panel's actual edge. A tangent extension can only ever look like it
// "exits the frame" if the frame's own edge is close enough to reach;
// a small box floating inside a much bigger empty area was never going
// to look like an edge no matter how far any one line was extended.
//
// The old box existed to solve a DIFFERENT, now-irrelevant problem: the
// artwork used to share the hero with a photo carousel taking up the
// other half of the page (this file's own top comment, second
// paragraph), so BOX_WIDTH_PCT capped the artwork well short of the
// panel's own center to keep it off the carousel and, later, off the
// centered headline. That two-column layout no longer exists (see
// landing.tsx's own top comment) and the hero copy is centered with its
// own max-w-2xl column, not spanning the panel's full width -- so a
// sized box no longer serves any purpose, it was just left over from
// when the layout needed it, and it is what was silently causing every
// extended line to still read as "cut off": not a clipping bug, a
// leftover container this artwork no longer needs.
//
// Fix: removed the box entirely. The SVG's own viewBox is still cropped
// to the left cluster's real content (CONTENT_W/H, CROP_PAD below,
// unchanged) so meet still scales it sensibly, but it now renders
// straight into this component's own full-size root (the existing
// outer `absolute inset-0` div, spanning the entire hero) instead of a
// second, smaller div nested inside it -- "slap it on there", not put
// it in its own container. Anchored bottom-left exactly as before
// (xMinYMax meet), it now naturally reaches all the way to the hero's
// own real left and bottom edges, because there is no longer a smaller
// box holding it back from them.
const CONTENT_W = 860;
const CONTENT_H = 897;

// Eleventh direct instruction, with a screenshot showing hand-drawn red
// arrows continuing several lines' visible endpoints further up and to
// the left, off the edge of the artwork ("make the lines exit on the
// left... take the end points, extend it by making new like photoshop
// does with the curvature pen tool"): of the 37 surviving left-cluster
// lines, two different groups start at two different edges of the crop
// window (see the start/end points measured directly off CURVES) --
// lines 0-10 start at the crop's TOP edge (y=0, x:16-268, the "S-bend"
// this file's ninth-instruction comment already describes), while lines
// 20-47 start already flush against the crop's LEFT edge (x=0,
// y:88-895). Only this second group is what the reference screenshot's
// arrows are drawn on and what "exit on the left" describes -- they
// already touch the left edge but still render a visible rounded start
// cap right there, reading as a dead end, rather than continuing past
// the edge the way the rest of that same line continues past the
// bottom/right edges it also touches. LEFT_EDGE_LINE_INDICES below is
// exactly that second group (lines 0-10 are deliberately left alone --
// extending a top-edge start further "left" along ITS OWN tangent
// mostly moves further along the top edge or back into the canvas, not
// toward the left edge the reference is about; verified by computing
// that extension for line 0 before deciding to exclude this group,
// rather than assuming one rule fits every start point).
//
// This is fixed here, NOT in hero-lines-animation.js's CURVES data --
// that file stays an untouched, byte-for-byte port (this file's own top
// comment's standing rule) and its CURVES/PH/AMP arrays are private to
// its own closure, unreachable from outside. Instead this extends each
// path's rendered `d` string after the animation script writes it, the
// same "wrap the output, don't edit the source" approach this file
// already uses for right-side hiding (CSS display:none on specific
// [data-i], rather than deleting those lines from CURVES) and for the
// crop window (runtime viewBox/preserveAspectRatio edits on the
// injected <svg>, rather than editing hero-lines.svg on disk).
//
// Mechanism: a MutationObserver watches every one of these paths' `d`
// attribute (the animation script rewrites `d` on every one of its own
// requestAnimationFrame ticks). Each time `d` changes, extendPathStart
// reads that path's OWN first two points straight back out of the `d`
// string it just wrote (M x0,y0 then the first C control point) and
// treats (start point - control point) as that curve's own tangent AT
// its start, continuing backward -- the standard way to read a cubic
// bezier's direction of travel at t=0 and extend before it, and exactly
// what a curvature-pen "extend along the existing handle" does in an
// image editor: it does not invent a new direction, it continues the
// one the curve already has.
//
// A synthetic point is placed EXTEND_PX further out along that same
// tangent (normalized to unit length first, so every line -- regardless
// of its own point spacing -- extends by the same on-screen distance),
// and a new "M (that far point) C ... (back to the original start)"
// segment is spliced onto the FRONT of the existing `d`, before the
// path's own original M. The new segment's own two control points are
// simple linear interpolations along that same straight tangent line
// (a straight C segment, not curved), which is visually seamless
// because it shares the exact tangent direction the original curve
// already had at that point -- there is no kink where old and new
// segments meet.
//
// Twelfth direct instruction ("it still cut off, maybe its the crop"):
// correct diagnosis -- since every one of these lines' start already
// sits at x=0, and CROP_MIN_X was ALSO 0 (the viewBox's own left edge),
// the extension's new far point at x<0 was outside the viewBox from the
// instant it was drawn, so the SVG clipped it before it could ever
// render -- the extension existed in the `d` string but was invisible,
// which looks identical to "still cut off" from the outside.
//
// The first fix attempted here widened CROP_W/CROP_MIN_X so the viewBox
// itself included that negative-x space. That was reverted before
// shipping: under preserveAspectRatio="meet", the viewBox's own aspect
// ratio and the box's aspect ratio together decide which axis "meet"
// scales to fit, and widening the viewBox risked silently rescaling
// (shrinking) the ENTIRE already-tuned artwork if width happened to be
// the tighter-fitting axis at real panel sizes -- unverifiable without
// rendering the real component at real panel widths, exactly the "check
// the real thing, don't just reason about the numbers" discipline this
// file's fifth/sixth-instruction comments already established, so this
// was not risked.
//
// A second fix kept the viewBox itself untouched and instead made the
// SVG overflow:visible so x<0 geometry could draw, clipped one level
// out by a small bottom-left BOX <div>'s own edges instead of the
// viewBox. That got the extension actually rendering, but the visible
// result STILL read as "cut off" (thirteenth direct instruction, with a
// screenshot) -- because that box was itself small and sat well inside
// a much bigger empty area of the hero, so the extended line now had a
// real endpoint further along, floating in open space, rather than
// reaching anything that reads as an edge. See CONTENT_W/H's own
// comment further up this file for why that box was removed entirely
// rather than resized again -- the fix that actually worked was
// dropping the box, not further tuning its size or its clipping
// mechanism.
const EXTEND_PX = 220;

// Padding kept on the crop window's TOP/RIGHT/BOTTOM edges, so stroke
// width and motion amplitude never clip right at the viewBox's own
// edge. The LEFT edge gets none of this pad -- the content's own
// bounding box already starts at x=0, flush with the source data's left
// edge, so any left pad here just becomes a visible gap between where
// the crop starts and where the lines actually start (reported directly
// at the time: "it has a little gap on the left").
const CROP_PAD = 30;

const CROP_MIN_X = 0;
const CROP_MIN_Y = -CROP_PAD;
const CROP_W = CONTENT_W + CROP_PAD;
const CROP_H = CONTENT_H + CROP_PAD * 2;

// Opacity applied to the whole line layer so it reads as a light
// decorative backdrop behind the headline/CTA copy, never competing with
// it for attention -- independent of, and in addition to, the per-line
// luminance the feColorMatrix filter below already varies.
const LINE_OPACITY = 0.35;

// The left-edge-starting group described above -- lines 0-10 (the
// top-edge S-bend group) and the already-hidden RIGHT_SIDE_LINE_INDICES
// are both deliberately excluded, see this file's comment above.
const LEFT_EDGE_LINE_INDICES = [
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 40,
  41, 42, 43, 44, 45, 46, 47,
];

function extendPathStart(pathEl: SVGPathElement) {
  const d = pathEl.getAttribute("d");
  if (!d) return;

  // Every `d` this component ever sees is toPath()'s own output:
  // "M x0,y0" followed by one or more "C cx1,cy1 cx2,cy2 x,y" commands,
  // always starting with exactly one M. Pulling out just the M and the
  // FIRST C's first control point is enough to get the start point and
  // start tangent -- everything after that first C is left untouched,
  // string-appended back on unparsed.
  const match = /^M(-?[\d.]+),(-?[\d.]+)C(-?[\d.]+),(-?[\d.]+)/.exec(d);
  if (!match) return;

  const [, mx, my, c1x, c1y] = match;
  const x0 = parseFloat(mx);
  const y0 = parseFloat(my);
  const cx1 = parseFloat(c1x);
  const cy1 = parseFloat(c1y);

  // Tangent at the start point, pointing FROM the first control point
  // BACK THROUGH the start point (i.e. continuing in the direction the
  // curve arrives from) -- the reverse of (c1 - start), which is the
  // direction the curve leaves the start point heading further into the
  // line, not back out of it.
  let tx = x0 - cx1;
  let ty = y0 - cy1;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;

  const farX = x0 + tx * EXTEND_PX;
  const farY = y0 + ty * EXTEND_PX;
  // Control points a third and two-thirds of the way along the same
  // straight tangent line, so the new segment is a straight run (not a
  // curved one) that meets the original curve's own start tangent with
  // no kink.
  const ctrl1X = x0 + tx * (EXTEND_PX / 3);
  const ctrl1Y = y0 + ty * (EXTEND_PX / 3);
  const ctrl2X = x0 + tx * (EXTEND_PX * (2 / 3));
  const ctrl2Y = y0 + ty * (EXTEND_PX * (2 / 3));

  const prefix =
    `M${farX.toFixed(1)},${farY.toFixed(1)}` +
    `C${ctrl1X.toFixed(1)},${ctrl1Y.toFixed(1)} ` +
    `${ctrl2X.toFixed(1)},${ctrl2Y.toFixed(1)} ` +
    `${x0.toFixed(1)},${y0.toFixed(1)}`;

  pathEl.setAttribute("d", prefix + d);
}

export function HeroLinesBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // Re-crop the injected SVG before the animation starts: shrink the
    // viewBox to the surviving left cluster's own bounding box (CROP_W x
    // CROP_H, tightly padded) instead of the full 1639x923 source box,
    // and switch preserveAspectRatio to "xMinYMax meet". meet (not
    // slice) scales the whole cropped viewBox DOWN to fit the SVG
    // element's own rendered size (h-full, width auto -- set in the JSX
    // below, not a separate sized box; see this file's top comment,
    // thirteenth instruction, for why there is no longer a smaller box
    // in between). hero-lines.svg on disk is left byte-for-byte
    // unmodified; this only edits the one injected <svg> element's
    // attributes at runtime, the same way the animation script below
    // only ever rewrites `d` attributes, never structure.
    const svgEl = root.querySelector("svg");
    if (svgEl) {
      svgEl.setAttribute(
        "viewBox",
        `${CROP_MIN_X} ${CROP_MIN_Y} ${CROP_W} ${CROP_H}`
      );
      svgEl.setAttribute("preserveAspectRatio", "xMinYMax meet");
    }

    // The MutationObserver below is attached BEFORE
    // startHeroLinesAnimation runs, so it already catches that
    // function's very first frame(0) call (which paints the resting
    // shape synchronously, see hero-lines-animation.js) -- there is no
    // separate "extend once on mount" step needed here: every path
    // ships with no `d` attribute at all until frame(0) sets one for
    // the first time (hero-lines.svg's own <path> elements carry only
    // stroke/stroke-width), and the observer's own first callback
    // extends that first-ever `d` exactly the same way as every frame
    // after it.
    const isLeftEdgePath = (el: Element): el is SVGPathElement =>
      el instanceof SVGPathElement &&
      LEFT_EDGE_LINE_INDICES.includes(Number(el.dataset.i));

    const observer = new MutationObserver((records) => {
      observer.disconnect();
      for (const record of records) {
        if (
          record.type === "attributes" &&
          record.attributeName === "d" &&
          isLeftEdgePath(record.target as Element)
        ) {
          extendPathStart(record.target as SVGPathElement);
        }
      }
      observer.observe(root, {
        attributes: true,
        attributeFilter: ["d"],
        subtree: true,
      });
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["d"],
      subtree: true,
    });

    const destroy = startHeroLinesAnimation(root);
    return () => {
      observer.disconnect();
      destroy?.();
    };
  }, []);

  const hideRightSideCss = RIGHT_SIDE_LINE_INDICES.map(
    (i) => `.hero-lines-left-only [data-i="${i}"]`
  ).join(",");

  return (
    <div className="absolute inset-0 overflow-hidden bg-card">
      {/* Right-side line cluster hidden here, in CSS, rather than by
          editing hero-lines.svg -- see this file's own top comment. Each
          index gets its own fully-scoped ".hero-lines-left-only [data-i]"
          selector (not one shared ancestor prefix before a comma list),
          since a bare comma-separated selector list only scopes the
          first entry to that ancestor -- the rest would silently become
          unscoped, page-wide selectors. */}
      <style>{`${hideRightSideCss} { display: none; }`}</style>

      {/* feColorMatrix remaps the source's grayscale luminance (0 = black,
          1 = white) onto a dark-navy -> brand-blue ramp, so faint lines
          stay a pale blue and the bold lines read as the strong brand
          blue, matching how the original asset used luminance for depth
          against a black page background -- here against a white one. */}
      <svg width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="hero-lines-tint" colorInterpolationFilters="sRGB">
            {/* The source is grayscale (in_R = in_G = in_B = L, the line's
                luminance), so each output channel is read off the input
                RED channel only (coefficient on G and B = 0) as
                out = slope*L + navy_floor, ramping from the navy floor
                (0x07,0x2E,0x57) at L=0 to the brand blue ceiling
                (0x02,0x75,0xD7) at L=1. Alpha passes through untouched. */}
            <feColorMatrix
              type="matrix"
              values="
                -0.0196 0 0 0 0.0275
                 0.2784 0 0 0 0.1804
                 0.5020 0 0 0 0.3412
                 0      0 0 1 0
              "
            />
          </filter>
        </defs>
      </svg>

      {/* Full panel, no separate sized box -- thirteenth direct
          instruction ("why put it in a container too when you can just
          slap it on there since no ones occupying the space"). This div
          now matches the outer root exactly (absolute inset-0) instead
          of a smaller bottom-left-anchored box; see CONTENT_W/H's own
          comment further up this file for why that box was removed
          rather than resized again. overflow-hidden stays here as a
          safety backstop (the hero's own real edges are still a clip
          boundary, so nothing can spill past the hero section itself),
          but it is no longer the boundary doing the day-to-day work of
          keeping the artwork off the centered headline -- the SVG's own
          sizing below (h-full, width auto) does that now, by simply
          never scaling wider than its own fixed aspect ratio, the same
          way a plain image element with only its height set keeps its
          own proportions instead of stretching to fill a wider box. */}
      <div
        ref={containerRef}
        className="hero-lines-left-only absolute inset-0 overflow-hidden [&_svg]:absolute [&_svg]:bottom-0 [&_svg]:left-0 [&_svg]:block [&_svg]:h-full [&_svg]:w-auto"
        style={{
          filter: "url(#hero-lines-tint)",
          opacity: LINE_OPACITY,
        }}
        // The SVG markup itself (gradients + animated paths) is an
        // unmodified port of the supplied background file -- see this
        // file's own top comment. Sourced from our own bundled asset,
        // never user input, so this is safe.
        dangerouslySetInnerHTML={{ __html: heroLinesSvg }}
      />
    </div>
  );
}
