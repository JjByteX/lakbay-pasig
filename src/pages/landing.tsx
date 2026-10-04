import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Envelope,
  Phone,
  MapPin,
  FacebookLogo,
  ArrowSquareOut,
  SealCheck,
  MapTrifold,
  Storefront,
  CalendarBlank,
  List,
  X,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import logo from "@/assets/lakbay-pasig-logo.svg";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchActiveSlides, type LandingSlide } from "@/lib/landing-slides";
import { fetchHomeShowcase } from "@/lib/home-query";
import type { CategoryRow } from "@/lib/home-types";
import {
  CategoryPhotoRow,
  CategoryPhotoRowSkeleton,
  type CategoryPhotoRowItem,
} from "@/components/public/category-photo-row";
import { HeroCarousel } from "@/components/public/hero-carousel";
import { HeroLinesBackground } from "@/components/public/hero-lines-background";
import { useAuthModal } from "@/lib/auth-modal";
import { usePageTitle } from "@/lib/page-title";
import { useAuth } from "@/lib/auth-context";
import { useDismissOnOutsideOrEscape } from "@/hooks/use-dismiss-on-outside-or-escape";

/**
 * landing-hero-phases.md Phase 6. Route /welcome, outside PublicShell --
 * per landing-hero-plan.md's Layout Pattern Rules citation, this is a
 * single-purpose entry surface, not a tab in the multi-section app, so
 * it gets no bottom nav, no global search, no sidebar of its own, same
 * reasoning admin-landing.tsx never borrows AdminDataTable for 2 rows.
 *
 * Landing redesign (Notion-style, stacked hero), per direct reference
 * image (notion.com marketing hero) + spec: this replaces the earlier
 * two-column split (headline left, carousel right, both full viewport
 * height -- see git history / decision-log for that version) with a
 * single centered column: centered nav, then a centered headline +
 * subtitle + CTAs block, then the HeroCarousel BELOW that text, full
 * width, page flows/scrolls normally rather than the old lg:h-screen
 * split panels.
 *
 * HeroLinesBackground (the animated blue line artwork) went through
 * three states across this redesign: (1) originally the fill of the old
 * left column only; (2) removed entirely in the first stacked-hero pass,
 * reasoning it had no equivalent placement outside that column; (3)
 * brought BACK per direct instruction ("the wave lines should be in the
 * background") -- now mounted once as a full-bleed absolute backdrop
 * behind the WHOLE hero (headline through carousel), not one column of
 * it. See the hero markup's own comment below for the stacking-context
 * mechanics (relative/overflow-hidden wrapper, inset-0 backdrop layer,
 * relative z-10 content on top). The component file itself
 * (hero-lines-background.tsx) is unchanged internally -- same left-
 * cluster-only crop, same blue tint filter, same bottom-left anchoring
 * -- only where landing.tsx mounts it changed.
 *
 * HeroCarousel (components/public/hero-carousel.tsx) is unchanged as a
 * component -- same fetchActiveSlides query, same autoplay/spring/
 * filmstrip drag, same progress dots. Its landing.tsx sizing went
 * through a similar back-and-forth: originally a lg:h-screen lg:w-1/2
 * side column; then a centered max-w-5xl contained box; then briefly
 * full-bleed (edge-to-edge, no max-width) per a "slap it in the
 * background" instruction about its BORDER/shadow, which also
 * inadvertently grew its width; then reverted back to the max-w-5xl
 * contained size per direct follow-up ("don't make the picture bigger
 * please, I liked the size of it before") while keeping the borderless/
 * shadowless treatment from that same instruction -- those two
 * properties (contained width vs. bordered/shadowed) are independent,
 * and only the width was ever meant to regress back.
 *
 * The header (LandingHeader, below) is now a centered nav to match the
 * reference: logo left, nav links CENTERED as their own group in the
 * middle of the bar, sign-in action pinned right -- a three-part
 * (left/center/right) bar via a 3-column grid, rather than the old
 * single flex row with logo-left/links-and-action-right. Still spans
 * the FULL page width and stays fixed for the entire page's scroll
 * range (unchanged reasoning from the previous revision: a header
 * scoped to a column or merely `sticky` within one disappears once the
 * page scrolls past that column's own height into About/Features/
 * Contact -- see the original note this replaced, preserved in git
 * history).
 *
 * Hero copy shortened post-launch (not in the original landing-hero-
 * plan.md): the original headline carried project-brief.md's full "The
 * Goal" sentence verbatim, which read as a wall of text above the fold.
 * Trimmed to a short headline plus one line, still sourced from the same
 * line rather than invented, not the full sentence restated.
 *
 * Three actions, three distinct triggers, no duplicates elsewhere on the
 * screen, per 6.3: Get started opens the popup in signup mode, Continue
 * as Guest is a plain Link to "/" -- now rendered as an outline Button
 * (Button asChild wrapping the Link) rather than an underlined text
 * link, per direct instruction to make it "a button"; it still
 * navigates as a plain Link under the hood (no new trigger, no popup),
 * only its visual treatment changed, so this is still the same single
 * guest-entry trigger, just styled as the secondary button beside Get
 * started rather than a text link beneath it. Log in is deliberately
 * NOT repeated here anymore -- ux-ui-guidelines.md's "one action, one
 * trigger, one place" rule (What Must Never Happen: "if a Sign In link
 * exists in the header, there is no Sign In button elsewhere on the
 * same screen") means the header's own NavAction (Sign in / Go to
 * Dashboard) is now the only sign-in trigger on this page; the old
 * second Log in button next to Get started was a duplicate of it and
 * has been removed. The popup itself (auth-modal.tsx) is a fully
 * separate file/concern, this page only calls into it.
 *
 * About and Contact sections, below the hero, same single page (no
 * separate routes, no nav to build for a multi-section site). About's
 * copy is project-brief.md's own "The Problem" and "The Goal" lines, not
 * new marketing text, matching how the hero copy above is sourced rather
 * than invented. Contact is now two columns per direct spec: left is the
 * same real CATO details as before (address, email, phone, Facebook, not
 * fabricated, per decision-log.md entry #17's standing rule on sourcing
 * real content), right is a plain Google Maps iframe embed centered on
 * that same address -- no API key needed (a bare maps.google.com/maps?
 * output=embed URL), and this is a separate concern from discover-map.tsx's
 * MapLibre-based discovery map: that map plots live verified places for
 * browsing, this one just shows CATO's own office location, a "find us"
 * embed, not an interactive feature, so pulling in a second mapping
 * approach here doesn't create a real inconsistency.
 *
 * Features section, between About and Contact: reuses home.tsx's own
 * Places/Businesses photo showcase wholesale (fetchHomeShowcase from
 * home-query.ts, CategoryPhotoRow from category-photo-row.tsx), the
 * exact same live, verified content a signed-in resident sees on their
 * Home feed, so a guest scrolling this page sees real Pasig places and
 * businesses instead of stock-photo placeholders. Works signed out
 * because places_select_public/businesses_select_public (the same RLS
 * policies Discover and Home already read under) are public-readable for
 * verified rows, no session required. Trails and Events are named
 * alongside it as a plain line, not a third live query: trail-card.tsx's
 * own row shape (name/theme/duration, no photo) doesn't match
 * CategoryPhotoRow's photo-tile shape, so folding it into the same strip
 * would look like a broken row rather than a second kind of card.
 *
 * This page now genuinely exceeds one viewport, so it scrolls;
 * ux-ui-guidelines.md's Layout Pattern Rules calls scrolling appropriate
 * exactly when content volume exceeds a single screen, not before.
 */
const CATO_ADDRESS = "4th Floor, Pasig Revolving Tower, Market Avenue, Barangay San Nicolas, Pasig City, 1600 Metro Manila";
const CATO_EMAIL = "cato@pasigcity.gov.ph";
const CATO_PHONE = "+63 2 8643 1111";
const CATO_FACEBOOK = "https://www.facebook.com/CATOPasig/";
// Plain Google Maps embed, no API key: maps.google.com/maps?q=<address>&output=embed
// resolves the same free-text address CATO_ADDRESS already carries, same
// URL shape Google documents for a keyless iframe embed.
const CATO_MAP_EMBED_SRC = `https://maps.google.com/maps?q=${encodeURIComponent(CATO_ADDRESS)}&output=embed`;
const CATO_MAP_DIRECTIONS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CATO_ADDRESS)}`;

// Header action, session-dependent per direct spec: a guest sees Sign
// in (opens the shared auth popup, this is now the page's ONLY sign-in
// trigger, per this file's own top comment on the removed duplicate Log
// in button); a signed-in staff/admin sees Go to Dashboard (-> /admin,
// matching App.tsx's staff shell root); a signed-in resident sees Go to
// Dashboard too, but routed to "/" (Home feed), per direct answer, since
// residents have no /admin equivalent -- the label stays the same across
// both signed-in cases, only the destination differs, so this isn't a
// third branch, just one signed-in branch with a role-picked target.
//
// `mobile` is the same action inside the mobile menu: full width and the
// regular button height, and `onAction` closes the menu first so it is not
// left open behind the auth popup or the page navigation.
function NavAction({ mobile = false, onAction }: Readonly<{ mobile?: boolean; onAction?: () => void }>) {
  const { session, profile } = useAuth();
  const { openAuth } = useAuthModal();
  const navigate = useNavigate();

  // The header itself is now bg-card (light), full page width, per this
  // file's own top comment on LandingHeader -- no longer the dark navy
  // panel this button was originally tuned against. variant="secondary"
  // (bg-secondary navy, secondary-foreground text) now supplies the
  // needed contrast directly, so this no longer needs its own pill
  // override or the "outline" variant's border-stripping.
  const size = mobile ? "lg" : "sm";
  const className = mobile ? "w-full" : undefined;

  if (!session) {
    return (
      <Button
        onClick={() => {
          onAction?.();
          openAuth("login");
        }}
        variant="secondary"
        size={size}
        className={className}
      >
        Sign in
      </Button>
    );
  }

  const isStaff = !!profile?.staff_role || profile?.role === "staff";
  const dashboardPath = isStaff ? "/admin" : "/";

  return (
    <Button
      onClick={() => {
        onAction?.();
        navigate(dashboardPath);
      }}
      variant="secondary"
      size={size}
      className={className}
    >
      {isStaff ? "Go to Dashboard" : "Go to Home"}
    </Button>
  );
}

// Header, now full page width and fixed for the ENTIRE page, not scoped
// to the left (hero) column and not merely sticky-within-that-column.
// Direct instruction: the bar was "just half" (it stopped at the hero's
// lg:w-1/2 split) and needed to "still appear down to the bottom part of
// the page" while scrolling -- a plain `sticky` header inside the left
// column only tracks that column, and that column's own min-h-screen
// height means the header visually disappears once the page scrolls past
// the hero into About/Features/Contact. `fixed inset-x-0 top-0` pins it
// to the viewport itself (spanning full width, both former columns) for
// the page's entire scroll range, the same "persistent element never
// resizes or disappears on navigation" rule ux-ui-guidelines.md's Layout
// Pattern Rules states for header/nav/footer, applied here to scroll
// position rather than route navigation. z-50 keeps it above the hero
// content and every section below. Since a fixed
// element is pulled out of flow, the hero wrapper below adds matching
// top padding (pt-16, this header's own h-16) so no content starts
// underneath it.
//
// Originally translucent + backdrop-blur, "like Apple," per an earlier
// direct answer, over bg-card/80 rather than bg-secondary/70 since the
// header spans past the hero into the light About/Features/Contact
// sections beneath it and a navy-tinted translucency would mismatch
// those. That translucency is gone now -- see the fifteenth-instruction
// comment right below, on LandingHeader itself, for why plain, fully
// opaque bg-card replaced it.
// Three-part bar (logo / centered links / action) via a 3-column grid,
// per the Notion reference: nav links sit centered as their own group in
// the middle of the bar, independent of the logo's and action's own
// widths, rather than the previous single flex row that grouped links
// with the action on the right. The outer two grid columns are mirrored
// (each 1fr) so the CENTER column -- and the nav links inside it -- stays
// visually centered on the bar as a whole, not just centered between
// wherever the logo and action happen to end; the logo and action each
// sit in their own column with justify-self so they don't stretch.
// Fifteenth direct instruction ("remove all outline dividers and
// outline in the top bar in the landing page completely. also nav and
// background color of hero must be identical"): two related changes.
//
// border-b border-border is dropped from this header entirely -- that
// was the one border/divider actually on the top bar itself (at the
// time, the section dividers further down the page -- About/Features/
// Contact's own border-t border-border -- were a different, separate
// part of the page this instruction didn't reference, so those were
// left alone here; a follow-up sixteenth instruction removed those too,
// see the About section's own comment). With no border-bottom, there is
// no outline left on the top bar at all.
//
// bg-card/80 + backdrop-blur-md is also dropped, down to a plain, fully
// opaque bg-card. Those were there because this header floats `fixed`
// over the page and other sections scroll up underneath it -- partial
// opacity plus blur is what let whatever was scrolling by underneath
// show through softly instead of a hard cut. But partial opacity is, by
// definition, never IDENTICAL to a flat color behind it -- once
// anything other than the hero's own flat bg-card scrolls underneath
// (About, Features, Contact, all bg-card or bg-background depending on
// section), the header would render as a translucent blend of bg-card
// and whatever's beneath it, not bg-card itself. Since the instruction
// specifically requires the nav and the hero background to be
// IDENTICAL colors, not just similar, this header now uses plain
// bg-card at full opacity -- the exact same class the hero wrapper
// itself uses (landing.tsx's hero <div>, see its own comment) -- so the
// two are the same color under every circumstance, not just while the
// page happens to be scrolled to the top.

// Header nav: click animates the page scroll instead of jumping.
//
// The links keep real href="#id" so open-in-new-tab, copy-link and no-JS
// still work; a plain left click is intercepted and animated with motion's
// `animate`. The URL hash is deliberately not touched: the app runs on a
// data router (main.tsx), and writing history state behind its back can
// corrupt its back/forward bookkeeping.
//
// Duration grows with distance (long jumps get more time, short ones stay
// snappy) and uses an ease-in-out curve. The animation stops the moment the
// visitor takes over the scroll themselves (wheel, touch, scroll keys), so it
// never fights them, and is skipped entirely for reduced-motion users.
const NAV_LINKS = [
  { id: "top", label: "Home" },
  { id: "about", label: "About" },
  { id: "features", label: "Features" },
  { id: "contact", label: "Contact" },
] as const;

const NAV_SCROLL_EASE = [0.65, 0, 0.35, 1] as const;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
// Stops the in-flight nav scroll (if any) and removes its listeners.
let stopNavScroll: (() => void) | null = null;

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;

  // Land where the CSS scroll-mt-20 on each section says to, so the fixed
  // header never covers the heading. #top is the page itself.
  const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const to = id === "top"
    ? 0
    : Math.min(Math.max(target.getBoundingClientRect().top + window.scrollY - margin, 0), maxScroll);
  const from = window.scrollY;

  stopNavScroll?.();
  if (Math.abs(to - from) < 2) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, to);
    return;
  }

  const distance = Math.abs(to - from);
  const duration = Math.min(1.4, Math.max(0.6, distance / 2200 + 0.4));

  const onKey = (e: KeyboardEvent) => {
    if (SCROLL_KEYS.has(e.key)) stop();
  };
  const stop = () => {
    controls.stop();
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", onKey);
    if (stopNavScroll === stop) stopNavScroll = null;
  };

  const controls = animate(from, to, {
    duration,
    ease: NAV_SCROLL_EASE,
    onUpdate: (value) => window.scrollTo(0, value),
    onComplete: stop,
  });
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", onKey);
  stopNavScroll = stop;
}

function handleNavClick(e: MouseEvent<HTMLAnchorElement>, id: string) {
  // Let the browser handle new-tab / download style clicks.
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  scrollToSection(id);
}

// Below the sm breakpoint the centered links and the action would not fit
// in the pill (the links used to simply disappear on phones, leaving only
// the logo and Sign in), so there the pill shows the logo and a menu button.
// The button opens a dropdown card under the pill with the same nav links
// (animated scroll, same handler as desktop) and the same NavAction. It
// closes on a link or action tap, Escape, a tap outside the header, or when
// the viewport grows past the breakpoint. Desktop layout is unchanged.
function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const closeMenu = () => setMenuOpen(false);
  useDismissOnOutsideOrEscape(headerRef, closeMenu);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <header
      ref={headerRef}
      className="fixed inset-x-4 top-4 z-50 mx-auto grid h-14 max-w-5xl grid-cols-[1fr_auto_1fr] items-center rounded-full border border-border bg-card/70 px-5 backdrop-blur-md"
    >
      <Link to="/welcome" className="flex items-center gap-2 justify-self-start">
        <img src={logo} alt="Lakbay Pasig" className="h-8 w-8" />
      </Link>

      <nav className="col-start-2 hidden items-center gap-6 justify-self-center sm:flex">
        {NAV_LINKS.map((link) => (
          <motion.a
            key={link.id}
            href={`#${link.id}`}
            onClick={(e) => handleNavClick(e, link.id)}
            whileTap={{ scale: 0.94 }}
            className="text-sm font-medium text-foreground/80 hover:text-foreground"
          >
            {link.label}
          </motion.a>
        ))}
      </nav>

      <div className="col-start-3 hidden justify-self-end sm:block">
        <NavAction />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="col-start-3 justify-self-end rounded-full sm:hidden"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="landing-mobile-menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <List className="h-5 w-5" aria-hidden="true" />}
      </Button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="landing-mobile-menu"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="absolute inset-x-0 top-full mt-2 origin-top rounded-3xl border border-border bg-card p-3 shadow-lg sm:hidden"
          >
            <nav aria-label="Landing page sections" className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <motion.a
                  key={link.id}
                  href={`#${link.id}`}
                  onClick={(e) => {
                    handleNavClick(e, link.id);
                    closeMenu();
                  }}
                  whileTap={{ scale: 0.97 }}
                  className="rounded-2xl px-4 py-3 text-base font-medium text-foreground hover:bg-muted"
                >
                  {link.label}
                </motion.a>
              ))}
            </nav>
            <div className="mt-2 border-t border-border pt-3">
              <NavAction mobile onAction={closeMenu} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// The hero carousel just fades in. It used to also scale and slide as it
// scrolled into view; that scroll-linked transform sat on top of the
// carousel and the animated line artwork and was a big part of the hero lag,
// so it is gone. No extra container around it.
function HeroCarouselFrame({ slides }: Readonly<{ slides: LandingSlide[] }>) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.5 }}
      className="relative z-10 aspect-[16/10] w-full max-w-5xl overflow-hidden rounded-lg sm:aspect-[16/9]"
    >
      <HeroCarousel slides={slides} />
    </motion.div>
  );
}

// Landing motion helpers (framer-motion, via the `motion` package already
// in the project). MotionConfig below honors the OS reduced-motion setting.
const EASE = [0.22, 1, 0.36, 1] as const;

function Reveal({ children, delay = 0, className }: Readonly<{ children: ReactNode; delay?: number; className?: string }>) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

// Word-by-word fade/blur reveal, ported from Qula's RevealWords
// (work.tsx, used for the project modal text): every word is its own span
// that fades in from 4px below while going from blur(3px) to sharp, each
// one staggered a few milliseconds after the last. Qula plays it on mount
// because it lives in a modal; here it plays once when the text scrolls
// into view. The parent drives the children through variants, so the
// stagger always starts from the moment the text becomes visible.
function RevealWords({
  text,
  className,
  wordDelay = 0.022,
  duration = 0.4,
}: Readonly<{ text: string; className?: string; wordDelay?: number; duration?: number }>) {
  let wordIndex = 0;
  return (
    <motion.p
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
    >
      {text.split(/(\s+)/).map((part, i) => {
        if (!part.trim()) return part;
        const delay = wordIndex * wordDelay;
        wordIndex++;
        return (
          <motion.span
            key={`${part}-${i}`}
            className="inline-block"
            style={{ whiteSpace: "pre" }}
            variants={{
              hidden: { opacity: 0, y: 4, filter: "blur(3px)" },
              show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration, delay, ease: "easeOut" } },
            }}
          >
            {part}
          </motion.span>
        );
      })}
    </motion.p>
  );
}

// Scroll-driven section container. Only the panel behind the content
// animates (scale and corner radius); the content on top never moves.
// "enter": the panel starts inset with rounded corners and opens to full
// width as it arrives. "exit": the panel shrinks and rounds off as it
// scrolls away. The layer sits at -z-10 inside an isolated stacking
// context, so children need no extra positioning.
//
// "enter" settles at progress 1 when the section's top reaches 30% of the
// viewport. A section that sits at the very bottom of the page (Contact,
// followed only by the footer) can never be scrolled that far up, so its
// progress stalled short of 1 and the panel stayed shrunken and rounded
// forever. `settleAtEnd` finishes the animation when the section's bottom
// edge reaches the viewport bottom instead, which every last section can
// reach.
//
// "exit" only scales (a compositor-only transform) and keeps a fixed bottom
// radius. Animating borderRadius on an overflow-hidden layer forces a
// repaint of everything inside it each frame, and the hero layer holds the
// animated line artwork.
function ScrollPanel({
  id,
  mode,
  bg,
  layer,
  className,
  settleAtEnd = false,
  children,
}: Readonly<{
  id?: string;
  mode: "enter" | "exit";
  bg: string;
  layer?: ReactNode;
  className?: string;
  settleAtEnd?: boolean;
  children: ReactNode;
}>) {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const exiting = mode === "exit";
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: exiting
      ? ["start start", "end start"]
      : settleAtEnd
        ? ["start end", "end end"]
        : ["start end", "start 0.3"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], exiting ? [1, 0.93] : [0.9, 1]);
  const borderRadius = useTransform(scrollYProgress, [0, 1], [56, 0]);
  // Reduced motion: no scroll-driven style at all. Exit: scale only.
  const layerStyle = reduceMotion ? undefined : exiting ? { scale } : { scale, borderRadius };
  return (
    <section ref={ref} id={id} className={`relative isolate ${className ?? ""}`}>
      <motion.div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 overflow-hidden ${bg} ${exiting ? "rounded-b-[2.5rem] will-change-transform" : ""}`}
        style={layerStyle}
      >
        {layer}
      </motion.div>
      {children}
    </section>
  );
}

function Tile({ className, delay = 0, children }: Readonly<{ className: string; delay?: number; children: ReactNode }>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -4 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      className={`flex flex-col gap-4 overflow-hidden rounded-[2rem] p-7 ${className}`}
    >
      {children}
    </motion.div>
  );
}

const HEADLINE = ["Lakbay", "Pasig."];

export default function LandingPage() {
  usePageTitle("Welcome");

  const navigate = useNavigate();
  const { openAuth } = useAuthModal();

  // Hero slides: every active row from the same landing_slides admin
  // table (fetchActiveSlides, sorted by sort_order), handed to
  // HeroCarousel to cycle through -- not just the first one. Admin
  // management of slides (admin-landing.tsx, slide-form-dialog.tsx) is
  // unchanged; this page just displays the full active set again instead
  // of only ever showing active[0].
  const [heroSlides, setHeroSlides] = useState<LandingSlide[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const active = await fetchActiveSlides();
        if (!cancelled) setHeroSlides(active);
      } catch {
        if (!cancelled) setHeroSlides([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Features section: same fetchHomeShowcase call home.tsx's own effect
  // (Phase 5.1) makes, kept as its own independent effect here for the
  // same reason home.tsx keeps its Announcements and Showcase effects
  // separate -- an unrelated, independently-failing query, not something
  // to bundle into the hero's slides effect above. Loading/error/empty
  // handled the same three-way way home.tsx's own showcaseBody does,
  // reusing that exact ordering (error, then loading, then empty) rather
  // than inventing a new precedence here.
  const [placeCategoryRows, setPlaceCategoryRows] = useState<CategoryRow[]>([]);
  const [businessCategoryRows, setBusinessCategoryRows] = useState<CategoryRow[]>([]);
  const [showcaseLoading, setShowcaseLoading] = useState(true);
  const [showcaseError, setShowcaseError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setShowcaseLoading(true);
      setShowcaseError(false);
      try {
        const data = await fetchHomeShowcase();
        if (!cancelled) {
          setPlaceCategoryRows(data.placeCategoryRows);
          setBusinessCategoryRows(data.businessCategoryRows);
        }
      } catch {
        if (!cancelled) {
          setPlaceCategoryRows([]);
          setBusinessCategoryRows([]);
          setShowcaseError(true);
        }
      } finally {
        if (!cancelled) setShowcaseLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tap-through target matches home.tsx's own openItem exactly (Phase
  // 5.3): /discover/:kind/:id, same route a signed-in Home visitor lands
  // on, so a guest tapping a card here sees the same detail page rather
  // than a dead end or a forced sign-in.
  const openShowcaseItem = (item: CategoryPhotoRowItem) =>
    navigate(`/discover/${item.kind}/${item.id}`);

  const showcaseIsEmpty = placeCategoryRows.length === 0 && businessCategoryRows.length === 0;

  let featuresBody: ReactNode;
  if (showcaseError) {
    featuresBody = <p className="text-sm text-destructive">Could not load featured content.</p>;
  } else if (showcaseLoading) {
    featuresBody = (
      <div className="flex flex-col gap-6">
        <CategoryPhotoRowSkeleton />
        <CategoryPhotoRowSkeleton />
      </div>
    );
  } else if (showcaseIsEmpty) {
    featuresBody = <EmptyState icon={SealCheck}>Verified places and businesses will appear here.</EmptyState>;
  } else {
    featuresBody = (
      <div className="flex flex-col gap-8">
        {placeCategoryRows.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-foreground">Heritage Places</h3>
            {placeCategoryRows.map((row) => (
              <CategoryPhotoRow
                key={row.categoryId}
                categoryName={row.categoryName}
                items={row.items}
                onSelect={openShowcaseItem}
              />
            ))}
          </div>
        )}

        {businessCategoryRows.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-foreground">Local Businesses</h3>
            {businessCategoryRows.map((row) => (
              <CategoryPhotoRow
                key={row.categoryId}
                categoryName={row.categoryName}
                items={row.items}
                onSelect={openShowcaseItem}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    {/* The root paints --landing-backdrop (index.css), the layer that shows
        behind the scroll panels while they scale and round. It used to be
        the page's own near-white --background, which is almost identical
        to the white panels, so the layer was barely visible in light mode
        and only faintly in dark mode. */}
    <div id="top" className="flex min-h-screen flex-col bg-[hsl(var(--landing-backdrop))]">
      <LandingHeader />

      {/* Hero: centered title, subtitle and buttons, then the carousel,
          which fades in. */}
      <ScrollPanel
        mode="exit"
        bg="bg-card"
        layer={<HeroLinesBackground />}
        className="flex flex-col items-center gap-8 px-6 pb-16 pt-24 text-center lg:px-12 lg:pt-28"
      >

        <div className="relative z-10 flex max-w-3xl flex-col items-center gap-4">
          <motion.h1
            className="text-5xl font-semibold text-foreground lg:text-6xl"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.14 } } }}
          >
            {HEADLINE.map((word) => (
              <motion.span
                key={word}
                className="mr-[0.25em] inline-block last:mr-0"
                variants={{ hidden: { opacity: 0, y: 48 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } } }}
              >
                {word}
              </motion.span>
            ))}
          </motion.h1>
          <motion.p
            className="max-w-xl text-base text-muted-foreground lg:text-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.45 }}
          >
            Thousand moments in this city worth living for.
          </motion.p>
        </div>

        <motion.div
          className="relative z-10 flex flex-col items-center gap-3 sm:flex-row"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.65 }}
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} className="w-full sm:w-auto">
            <Button onClick={() => openAuth("signup")} size="lg" className="w-full sm:w-auto">
              Get started
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} className="w-full sm:w-auto">
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link to="/">Continue as Guest</Link>
            </Button>
          </motion.div>
        </motion.div>

        <HeroCarouselFrame slides={heroSlides} />
      </ScrollPanel>

      {/* About: scroll-lit statement, then a bento grid. Copy rules still
          hold: no comparison with other platforms, no blanket "everything
          is verified" claim, no em dashes. */}
      <ScrollPanel id="about" mode="enter" bg="bg-card" className="scroll-mt-20 px-6 py-28 lg:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-20">
<RevealWords
            className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl lg:text-5xl"
            text="Pasig's heritage sites, local businesses and cultural history sit scattered across listings and social media. Lakbay Pasig brings them back to one source, the City Tourism Office, so every place comes with its story."
          />

          <div className="grid gap-4 md:auto-rows-[minmax(14rem,auto)] md:grid-cols-4">
            <Tile className="bg-primary text-primary-foreground md:col-span-2 md:row-span-2">
              <SealCheck className="h-9 w-9" aria-hidden="true" />
              <h3 className="text-3xl font-semibold sm:text-4xl">Reviewed by CATO</h3>
              <p className="max-w-sm text-base text-primary-foreground/85">
                CATO staff review every place and business, and its status is shown plainly, so you always know where a listing stands.
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                {["Verified", "Pending", "Not yet verified"].map((label) => (
                  <span key={label} className="rounded-full bg-primary-foreground/15 px-4 py-1.5 text-sm font-semibold">
                    {label}
                  </span>
                ))}
              </div>
            </Tile>

            <Tile delay={0.1} className="border border-border bg-background text-foreground">
              <MapTrifold className="h-8 w-8 text-primary" aria-hidden="true" />
              <h3 className="text-2xl font-semibold">Trails with a story</h3>
              <p className="text-base text-muted-foreground">Walk the city in sequence, with context at every stop.</p>
            </Tile>

            <Tile delay={0.2} className="border border-border bg-background text-foreground">
              <Storefront className="h-8 w-8 text-primary" aria-hidden="true" />
              <h3 className="text-2xl font-semibold">Local businesses</h3>
              <p className="text-base text-muted-foreground">Find shops and eateries near Pasig's heritage sites.</p>
            </Tile>

            <Tile delay={0.3} className="border border-border bg-background text-foreground md:col-span-2">
              <CalendarBlank className="h-8 w-8 text-primary" aria-hidden="true" />
              <h3 className="text-2xl font-semibold">CATO events</h3>
              <p className="text-base text-muted-foreground">Events and guided Trails unlock once you sign in.</p>
            </Tile>
          </div>
        </div>
      </ScrollPanel>

      {/* Features: same live verified showcase (fetchHomeShowcase,
          CategoryPhotoRow). The #features id stays for the header link.
          This used to be a plain bg-background <section>: fully opaque and
          not a ScrollPanel, so it had no container animation and painted
          over the page backdrop. It is now a ScrollPanel on bg-card like
          About and Contact, so the panel opens up against the backdrop as
          it scrolls in. */}
      <ScrollPanel id="features" mode="enter" bg="bg-card" className="scroll-mt-20 px-6 py-24 lg:px-16">
        <Reveal className="mx-auto flex max-w-3xl flex-col gap-6">
          <h2 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">See what is waiting for you</h2>
          {featuresBody}
        </Reveal>
      </ScrollPanel>

      {/* Final call to action: flat rounded block, no decoration */}
      <section className="bg-background px-4 py-16">
        <Reveal className="mx-auto flex max-w-6xl flex-col items-center gap-6 rounded-[2rem] bg-primary px-6 py-20 text-center text-primary-foreground">
          <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl">Start walking.</h2>
          <p className="max-w-md text-lg text-primary-foreground/85">
            Sign in to unlock trails and events, or browse the city as a guest.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => openAuth("signup")} size="lg" className="w-full border-transparent bg-card text-foreground hover:bg-card/90 sm:w-auto">
              Get started
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto">
              <Link to="/">Continue as Guest</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      {/* Contact: two columns per direct spec. Left keeps the real CATO
          details exactly as before (icon-plus-label per ux-ui-
          guidelines.md's Icon Rules, MapPin reused from directions-
          panel.tsx/discover-map.tsx rather than a new icon for the same
          address concept). Right is a plain Google Maps iframe embed
          centered on that same CATO_ADDRESS, no API key needed -- a
          separate, simpler concern from discover-map.tsx's own MapLibre
          discovery map (that one plots live verified places for
          browsing; this one just shows where the office is), so it
          doesn't need to share that map's tile setup. A "Get directions"
          link beneath the embed opens the same address in Google Maps
          proper, for anyone who wants turn-by-turn rather than just a
          look at the pin. */}
      <ScrollPanel id="contact" mode="enter" settleAtEnd bg="bg-card" className="scroll-mt-20 px-6 py-16 lg:px-16">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold text-foreground">Contact</h2>
            <p className="text-base text-muted-foreground">
              City Culture, Arts, Tourism and Old Pasig Office (CATO)
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-base text-foreground">{CATO_ADDRESS}</span>
              </div>

              <div className="flex items-center gap-3">
                <Envelope className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <a href={`mailto:${CATO_EMAIL}`} className="text-base text-foreground underline">
                  {CATO_EMAIL}
                </a>
              </div>

              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <a href={`tel:${CATO_PHONE.replace(/\s+/g, "")}`} className="text-base text-foreground underline">
                  {CATO_PHONE}
                </a>
              </div>

              <div className="flex items-center gap-3">
                <FacebookLogo className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  href={CATO_FACEBOOK}
                  target="_blank"
                  rel="noreferrer"
                  className="text-base text-foreground underline"
                >
                  facebook.com/CATOPasig
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="h-64 w-full overflow-hidden rounded-lg border border-border lg:h-auto lg:min-h-64 lg:flex-1">
              <iframe
                title="CATO office location"
                src={CATO_MAP_EMBED_SRC}
                className="h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <a
              href={CATO_MAP_DIRECTIONS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 self-start text-sm text-foreground underline"
            >
              Get directions
              <ArrowSquareOut className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </ScrollPanel>
    <footer className="bg-card px-6 py-6 text-center text-sm text-muted-foreground">
        Lakbay Pasig. Places and businesses reviewed by the Pasig City Tourism Office (CATO).
      </footer>
    </div>
    </MotionConfig>
  );
}
