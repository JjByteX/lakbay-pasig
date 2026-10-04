// Ambient type declaration for hero-lines-animation.js.
//
// That file is plain JS (ported animation math, not TypeScript), and this
// project's tsconfig.app.json has "strict": true with no "allowJs" /
// "checkJs", so importing it directly gives TS7016 ("Could not find a
// declaration file for module... implicitly has an 'any' type") --
// exactly the error the CI build first reported. The initial fix for
// that (a `declare module "./hero-lines-animation.js" { ... }` wrapper
// in this same file) then failed differently, with TS2306 ("File ...
// is not a module"): a .d.ts with the SAME BASE NAME as a sibling .js
// file (hero-lines-animation.d.ts next to hero-lines-animation.js) is
// resolved by TypeScript as that module's OWN declaration file directly
// -- it wants plain top-level exports describing that file's shape, not
// an ambient `declare module "path" { ... }` block wrapped around them;
// a file containing only that wrapper has nothing at its own top level,
// so TS doesn't see it as a module at all. Fixed here by dropping the
// `declare module` wrapper and exporting the function signature
// directly, which is the correct/standard form for a same-name sibling
// declaration file.
//
// startHeroLinesAnimation(root) reads/writes DOM nodes under `root` via
// querySelectorAll and returns a cleanup ("destroy") function -- see
// hero-lines-background.tsx's own useEffect, which calls this with its
// containerRef.current (an HTMLDivElement) and calls the returned
// function on unmount.
//
// The optional second argument was added for performance and every field
// is optional: `skip` (line indices never computed or written), `mapPath`
// (rewrites each line's `d` string once per frame, before the single DOM
// write), and `fps` (frame-rate cap for the loop).
export interface HeroLinesOptions {
  skip?: ReadonlySet<number>;
  mapPath?: (index: number, d: string) => string;
  fps?: number;
}

export function startHeroLinesAnimation(
  root: HTMLElement,
  options?: HeroLinesOptions
): () => void;
