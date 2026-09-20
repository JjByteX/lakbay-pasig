// Ambient type declaration for hero-lines-animation.js.
//
// That file is plain JS (ported animation math, not TypeScript), and this
// project's tsconfig.app.json has "strict": true with no "allowJs" /
// "checkJs", so importing it directly gives TS7016 ("Could not find a
// declaration file for module... implicitly has an 'any' type") --
// exactly the error the CI build reported. This file fixes that the
// standard way: a hand-written .d.ts beside the .js file, describing
// just the one function hero-lines-background.tsx actually imports and
// calls, without converting the .js file itself to .ts or touching its
// logic.
//
// startHeroLinesAnimation(root) reads/writes DOM nodes under `root` via
// querySelectorAll and returns a cleanup ("destroy") function -- see
// hero-lines-background.tsx's own useEffect, which calls this with its
// containerRef.current (an HTMLDivElement) and calls the returned
// function on unmount.
declare module "./hero-lines-animation.js" {
  export function startHeroLinesAnimation(root: HTMLElement): () => void;
}
