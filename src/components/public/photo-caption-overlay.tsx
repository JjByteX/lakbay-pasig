/**
 * A name over the bottom of a photo card: white text, a soft blur that fades
 * in toward the bottom edge, and a neutral black linear gradient under the
 * text. Same treatment as the landing hero's caption (hero-carousel.tsx,
 * CaptionOverlay), used by the in-app photo cards (category-photo-row.tsx on
 * Home and the landing Features row, saved-place-row.tsx on Saved) so the
 * landing page and the system read the same.
 *
 * Why this exists: those cards used to put `text-primary-foreground` on a navy
 * gradient. `--primary-foreground` is white in light mode but near-black navy
 * in dark mode (it is the text color for the bright blue primary button), so
 * in dark mode the title was dark navy on a dark navy scrim and could not be
 * read. The text here is fixed white, not a theme token, on purpose: it sits
 * on a photo, and a photo does not change with the theme. The gradient is
 * black for the same reason (a blue scrim also turned the photo's own colors
 * muddy).
 *
 * The blur layer and the gradient layer are separate so the blur can use a
 * mask: a bare backdrop-blur band would start with a hard edge. The mask
 * fades the blur out toward the top of the band, and the gradient is painted
 * over it. Both ignore the pointer so the card's own button gets every click.
 *
 * Everything is a <span>: both callers put this inside a <button>, where a
 * <div> or <p> is invalid HTML. The photo container must be `relative`; both
 * callers' already are. The text span deliberately has no `block` class
 * (absolute already blockifies it): Tailwind orders `block` after
 * `line-clamp-2` and it would replace the -webkit-box display line-clamp
 * needs.
 *
 * Opacities are a step stronger than the hero's (70/35 against 55/25): the
 * cards are 144 to 176 px wide with a two-line name at text-sm, so the text
 * sits higher up the gradient than the hero's one-line caption, where the
 * gradient is already thinner.
 */
// Blur is kept light on purpose: 6px over 60% of the card softened the photo
// too much. Now 2px, only over the bottom 2/5 (the title's area), and the mask
// fades it out from the very bottom, so the photo above the title stays sharp.
// The gradient below keeps its own, taller band for legibility.
const BLUR_MASK = "linear-gradient(to top, black 0%, transparent 100%)";

export function PhotoCaptionOverlay({ name }: Readonly<{ name: string }>) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 backdrop-blur-[2px]"
        style={{ WebkitMaskImage: BLUR_MASK, maskImage: BLUR_MASK }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/70 via-black/35 to-transparent"
      />
      <span className="pointer-events-none absolute inset-x-3 bottom-3 line-clamp-2 text-sm font-semibold text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.45)]">
        {name}
      </span>
    </>
  );
}
