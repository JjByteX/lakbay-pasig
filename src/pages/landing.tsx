import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowSquareOut,
  CalendarBlank,
  Envelope,
  FacebookLogo,
  List,
  MapPin,
  MapTrifold,
  Phone,
  SealCheck,
  Storefront,
  X,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
} from "motion/react";
import logo from "@/assets/lakbay-pasig-logo.svg";
import { Button } from "@/components/ui/button";
import { fetchActiveSlides, type LandingSlide } from "@/lib/landing-slides";
import { fetchHomeShowcase } from "@/lib/home-query";
import { CATO_EMAIL, CATO_FACEBOOK, CATO_NAME, CATO_PHONE } from "@/lib/cato-contact";
import type { CategoryRow } from "@/lib/home-types";
import {
  LandingPhotoFan,
  LandingPhotoFanSkeleton,
  type FanItem,
} from "@/components/public/landing-photo-fan";
import { HeroCarousel } from "@/components/public/hero-carousel";
import { useAuthModal } from "@/lib/auth-modal";
import { usePageTitle } from "@/lib/page-title";
import { useAuth } from "@/lib/auth-context";
import { useDismissOnOutsideOrEscape } from "@/hooks/use-dismiss-on-outside-or-escape";

/**
 * Route /welcome, outside PublicShell: a single-purpose entry surface with no
 * bottom nav, global search or sidebar.
 *
 * Header and pill buttons follow Pixel Point's marketing style (flat,
 * monochrome, hairline borders). The hero, About, Features, final call to action and
 * Contact are the original scroll-panel layout, without the animated wave
 * lines (HeroLinesBackground is no longer used here).
 *
 * Copy rules: no comparison with other platforms, no blanket "everything is
 * verified" claim, no em dashes. Contact details are the real CATO details
 * from cato-contact.ts.
 */
const CATO_ADDRESS = "4th Floor, Pasig Revolving Tower, Market Avenue, Barangay San Nicolas, Pasig City, 1600 Metro Manila";
// Plain Google Maps embed, no API key.
const CATO_MAP_EMBED_SRC = `https://maps.google.com/maps?q=${encodeURIComponent(CATO_ADDRESS)}&output=embed`;
const CATO_MAP_DIRECTIONS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CATO_ADDRESS)}`;

const EASE = [0.22, 1, 0.36, 1] as const;

// Same blue as the "Reviewed by CATO" tile in About (bg-primary). The fixed
// header and the hero panel share it, so they stay the exact same color.
const HERO_TINT = "bg-primary text-primary-foreground";
const PILL = "h-11 rounded-full px-6 text-sm";
const PILL_PRIMARY = `${PILL} border-transparent bg-card text-foreground hover:bg-card/90`;
const PILL_GHOST = `${PILL} border border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground`;

// Header action: a guest sees Sign in (the page's only sign-in trigger); a
// signed-in user sees a dashboard button, staff to /admin, residents to "/".
// `mobile` is the same action inside the mobile menu, full width, and
// `onAction` closes the menu first.
function NavAction({ mobile = false, onAction }: Readonly<{ mobile?: boolean; onAction?: () => void }>) {
  const { session, profile } = useAuth();
  const { openAuth } = useAuthModal();
  const navigate = useNavigate();

  const className = `${PILL_PRIMARY} ${mobile ? "w-full" : "h-9 px-5"}`;

  if (!session) {
    return (
      <Button
        onClick={() => {
          onAction?.();
          openAuth("login");
        }}
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
      className={className}
    >
      {isStaff ? "Go to Dashboard" : "Go to Home"}
    </Button>
  );
}

// Header nav: a click animates the page scroll instead of jumping. The links
// keep a real href="#id" so open-in-new-tab and copy-link still work; a plain
// left click is intercepted and animated with motion's `animate`. The URL hash
// is not touched (the app runs on a data router). The animation stops as soon
// as the visitor takes over the scroll, and is skipped for reduced motion.
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

// Flat, full-width bar pinned for the whole page: logo and wordmark left,
// plain text links, one pill action right. Hairline bottom border only.
// Below the sm breakpoint the links and action collapse into a menu button
// that opens a flat panel under the bar; it closes on a link or action tap,
// Escape, a tap outside, or when the viewport grows past the breakpoint.
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
    <header ref={headerRef} className={`fixed inset-x-0 top-0 z-50 border-b border-primary-foreground/20 ${HERO_TINT}`}>
      <div className="flex h-16 w-full items-center justify-between gap-6 px-6 lg:px-10">
        <Link to="/welcome" className="flex items-center gap-2.5">
          <img src={logo} alt="" className="h-8 w-8" />
          <span className="text-base font-semibold tracking-tight text-primary-foreground">Lakbay Pasig</span>
        </Link>

        <nav aria-label="Landing page sections" className="hidden items-center gap-8 sm:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={(e) => handleNavClick(e, link.id)}
              className="text-sm font-medium text-primary-foreground transition-opacity hover:opacity-80"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden sm:block">
          <NavAction />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="landing-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <List className="h-5 w-5" aria-hidden="true" />}
        </Button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="landing-mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE }}
            className={`absolute inset-x-0 top-full border-b border-primary-foreground/20 ${HERO_TINT} px-6 pb-6 pt-2 sm:hidden`}
          >
            <nav aria-label="Landing page sections" className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  onClick={(e) => {
                    handleNavClick(e, link.id);
                    closeMenu();
                  }}
                  className="border-b border-primary-foreground/20 py-4 text-lg font-medium tracking-tight text-primary-foreground"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-5">
              <NavAction mobile onAction={closeMenu} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// Landing motion helpers. MotionConfig below honors the OS reduced-motion setting.
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

// Section container: a plain full-width section with its own background. It
// used to animate (scale and corner radius as it scrolled in and out); that
// scroll-driven background animation is gone.
function Section({
  id,
  bg,
  className,
  children,
}: Readonly<{ id?: string; bg: string; className?: string; children: ReactNode }>) {
  return (
    <section id={id} className={`${bg} ${className ?? ""}`}>
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

// The hero carousel runs edge to edge (Qula-style full-bleed filmstrip: the
// center slide with its neighbors peeking in on both sides) and just fades in.
function HeroCarouselFrame({ slides }: Readonly<{ slides: LandingSlide[] }>) {
  // The carousel is not mounted until the title reveal has finished. Mounting
  // it at the start made the browser lay out, decode and paint several large
  // photos while the title was fading in, which dropped frames on the title.
  // The frame itself is always there so the page height never jumps. The
  // photos are only fetched (not decoded) in the meantime, so they are in the
  // cache by the time the carousel appears.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), REVEAL.end * 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    for (const slide of slides) {
      const image = new Image();
      image.src = slide.image_url;
    }
  }, [slides]);

  return (
    <div className="relative z-10 h-[420px] w-full overflow-hidden sm:h-[460px] lg:h-[540px]">
      {ready && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full w-full"
        >
          <HeroCarousel slides={slides} />
        </motion.div>
      )}
    </div>
  );
}

// Hero title reveal, adapted from Pixel Point's own site (their home hero,
// components/shared/title-animation). How theirs stays calm:
//   - No slide, no blur. A word just appears (opacity 0 to 1 in 0.05s), one
//     after the other, so the eye reads it like typing, not like motion.
//   - A highlighted word appears in an accent color, the line holds for 0.3s,
//     then that word fades to the text color over 0.2s. The hold is the only
//     pause; everything else runs at 0.05s a word.
//   - Their accents are saturated brand colors on black, settling to white, so
//     the flash reads as "emphasis" and the end state is the quietest color.
// Ours keeps those exact timings but is gentler on purpose:
//   - The accent is a tint of the final color (a soft sky blue that settles to
//     white, or a mid blue that settles to dark text in dark mode), so the
//     change is small. Dark navy on this blue flipped to white, a big
//     brightness jump that read as a flicker.
//   - One highlighted word in total ("Pasig."), not one per line.
const COLOR_DURATION = 0.6;
// No hold on the accent: it starts easing toward the final color almost as
// soon as the word appears. A held soft-blue word on this blue background looks
// like a half-faded white word, which read as a pause on "Pasig.".
const COLOR_DELAY = 0.1;
// Unlike Pixel Point (whose reveal waits until its full-screen hero is in
// view, on an otherwise still page), ours has to wait on purpose: a short
// pause so the nav and page settle before the first word.
//
// Their words are body-size text that pops in (0.05s), which works at that
// size. Our headline is huge, and a 0.05s pop on two giant words feels forced,
// so each group has its own pace: the headline fades its words in slowly with
// a beat between them, the subtitle types at reading pace, and a short beat
// separates the two.
const REVEAL_START = 0.5;
const GROUP_GAP = 0.1;
const HEADLINE_PACE = { step: 0.35, fade: 0.5 };
// A fade longer than the step means each word is still fading in while the
// next begins, so the line flows instead of ticking word by word.
const SUBTITLE_PACE = { step: 0.09, fade: 0.35 };

// Picks the accent from the text color the word settles on: light text gets a
// soft sky blue, dark text (dark mode) gets a mid blue.
function accentFor(finalColor: string) {
  const [r, g, b] = (finalColor.match(/\d+(\.\d+)?/g) ?? ["255", "255", "255"]).map(Number);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5 ? "#9CCBF2" : "#2F6FB0";
}

type RevealItem = { value: string; accent?: boolean };
type TimedItem = RevealItem & { delayOpacity: number; delayColor: number; fade: number };

const HEADLINE_ITEMS: RevealItem[] = [{ value: "Lakbay" }, { value: "Pasig.", accent: true }];
const SUBTITLE_ITEMS: RevealItem[] = [
  { value: "Thousand" },
  { value: "moments" },
  { value: "in" },
  { value: "this" },
  { value: "city" },
  { value: "worth living for." },
];

// One sequence across headline and subtitle, so the subtitle starts typing
// right after the headline lands. `end` is when the last word has finished,
// used to bring the buttons and carousel in after the text.
function buildReveal(groups: { items: RevealItem[]; step: number; fade: number }[]) {
  let previous = REVEAL_START;
  let first = true;
  const timed = groups.map(({ items, step, fade }, groupIndex) =>
    items.map((item, itemIndex): TimedItem => {
      if (!first) previous += step + (itemIndex === 0 && groupIndex > 0 ? GROUP_GAP : 0);
      first = false;
      const delayOpacity = previous;
      const delayColor = previous + COLOR_DELAY;
      // The accent word settles while the next words are already arriving, so
      // the line never stops and waits on it.
      if (item.accent) previous += fade * 0.6;
      return { ...item, delayOpacity, delayColor, fade };
    })
  );
  const last = groups[groups.length - 1];
  return { timed, end: previous + last.fade };
}

const REVEAL = buildReveal([
  { items: HEADLINE_ITEMS, ...HEADLINE_PACE },
  { items: SUBTITLE_ITEMS, ...SUBTITLE_PACE },
]);

// The words are plain inline spans (trailing space included), so the text
// wraps like normal text. Every animation here is opacity only. Animating
// `color` on a 96px word repaints the text on every frame (opacity runs on
// the GPU, color does not), and that was the choppiness on "Pasig.". So an
// accent word is two stacked copies: the base in the real text color, and an
// accent-colored copy on top that starts visible and fades out, which reads as
// a color change. `final` is the element's real text color, read from the DOM
// once, only to pick the accent tint and to hold the start until it is known.
function RevealText({
  as: Tag,
  items,
  className,
}: Readonly<{ as: "h1" | "p"; items: TimedItem[]; className: string }>) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [final, setFinal] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (ref.current) setFinal(getComputedStyle(ref.current).color);
  }, []);
  const Component = (Tag === "h1" ? motion.h1 : motion.p) as typeof motion.h1;
  return (
    <Component ref={ref} className={className}>
      {items.map((item) => (
        <Fragment key={item.value}>
          <motion.span
            className={item.accent ? "relative inline-block" : undefined}
            initial={{ opacity: 0 }}
            animate={final ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: item.fade, delay: item.delayOpacity, ease: "easeOut" }}
          >
            {item.value}
            {item.accent && final && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0"
                style={{ color: accentFor(final) }}
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: COLOR_DURATION, delay: item.delayColor, ease: "easeInOut" }}
              >
                {item.value}
              </motion.span>
            )}
          </motion.span>{" "}
        </Fragment>
      ))}
    </Component>
  );
}

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
  const openShowcaseItem = (item: FanItem) => navigate(`/discover/${item.kind}/${item.id}`);

  // Every verified item with a photo, places and businesses together. The fan
  // shuffles and trims this to what fits the screen.
  const fanItems = useMemo(() => {
    const seen = new Set<string>();
    const all: FanItem[] = [];
    for (const row of [...placeCategoryRows, ...businessCategoryRows]) {
      for (const item of row.items) {
        const key = `${item.kind}-${item.id}`;
        if (!item.coverPhotoUrl || seen.has(key)) continue;
        seen.add(key);
        all.push(item);
      }
    }
    return all;
  }, [placeCategoryRows, businessCategoryRows]);

  // The fan lives inside the final call to action. When the showcase fails or
  // has no photos there is nothing to show, so the block is just the text.
  let featuresBody: ReactNode = null;
  if (showcaseLoading) {
    featuresBody = <LandingPhotoFanSkeleton />;
  } else if (!showcaseError && fanItems.length > 0) {
    featuresBody = <LandingPhotoFan items={fanItems} onSelect={openShowcaseItem} />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <div id="top" className="flex min-h-screen flex-col bg-background text-foreground">
        <LandingHeader />

        {/* Hero: centered title, subtitle and buttons, then the carousel,
            which fades in. */}
        <Section
          bg={HERO_TINT}
          className="flex flex-col items-center gap-8 pb-16 pt-24 text-center lg:pt-28"
        >
          <div className="relative z-10 flex max-w-3xl flex-col items-center gap-4 px-6 lg:px-12">
            <RevealText
              as="h1"
              items={REVEAL.timed[0]}
              className="text-5xl font-semibold text-primary-foreground lg:text-6xl"
            />
            <RevealText
              as="p"
              items={REVEAL.timed[1]}
              className="max-w-xl text-base text-primary-foreground/85 lg:text-xl"
            />
          </div>

          <motion.div
            className="relative z-10 flex flex-col items-center gap-3 px-6 sm:flex-row lg:px-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: REVEAL.end }}
          >
            <Button onClick={() => openAuth("signup")} className={`${PILL_PRIMARY} w-full sm:w-auto`}>
              Get started
            </Button>
            <Button asChild variant="outline" className={`${PILL_GHOST} w-full sm:w-auto`}>
              <Link to="/">Continue as Guest</Link>
            </Button>
          </motion.div>

          <HeroCarouselFrame slides={heroSlides} />
        </Section>

        {/* About: scroll-lit statement, then a bento grid. */}
        <Section id="about" bg="bg-card" className="scroll-mt-20 px-6 py-28 lg:px-16">
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
        </Section>

        {/* Final call to action. On md and up the photo fan is its own layer
            across the right of the block, on top of it, not a grid column
            the text wraps around; the text sits on the left. The block does
            not clip, so a big fan can reach past its top and bottom edge. The #features
            id stays here for the header link. */}
        <section id="features" className="scroll-mt-20 bg-background px-4 py-16">
          <Reveal
            className={`relative mx-auto flex max-w-6xl flex-col gap-10 rounded-[2rem] bg-primary px-6 py-14 text-primary-foreground sm:px-10 md:px-12 ${
              featuresBody ? "md:min-h-[26rem] md:justify-center" : "items-center text-center"
            }`}
          >
            <div className={`relative z-0 flex flex-col gap-6 ${featuresBody ? "items-center text-center md:max-w-[44%] md:items-start md:text-left" : "items-center"}`}>
              <h2 className="text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">See what is waiting for you</h2>
              <p className="max-w-lg text-lg text-primary-foreground/85">
                <span className="block">Sign in to unlock trails and events,</span>
                <span className="block">or browse the city as a guest.</span>
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => openAuth("signup")} className={`${PILL} w-full border-transparent bg-card text-foreground hover:bg-card/90 sm:w-auto`}>
                  Get started
                </Button>
                <Button asChild variant="outline" className={`${PILL} w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto`}>
                  <Link to="/">Continue as Guest</Link>
                </Button>
              </div>
            </div>
            {featuresBody && (
              <div className="pointer-events-none relative z-10 w-full md:absolute md:-right-3 md:top-1/2 md:w-[68%] md:-translate-y-1/2">
                {featuresBody}
              </div>
            )}
          </Reveal>
        </section>

        {/* Contact: real CATO details left, keyless Google Maps embed right. */}
      <Section id="contact" bg={HERO_TINT} className="scroll-mt-20 px-6 py-16 lg:px-16">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold text-primary-foreground">Contact</h2>
            <p className="text-base text-primary-foreground/80">
              {CATO_NAME}
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary-foreground/80" aria-hidden="true" />
                <span className="text-base text-primary-foreground">{CATO_ADDRESS}</span>
              </div>

              <div className="flex items-center gap-3">
                <Envelope className="h-5 w-5 shrink-0 text-primary-foreground/80" aria-hidden="true" />
                <a href={`mailto:${CATO_EMAIL}`} className="text-base text-primary-foreground underline">
                  {CATO_EMAIL}
                </a>
              </div>

              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-primary-foreground/80" aria-hidden="true" />
                <a href={`tel:${CATO_PHONE.replace(/\s+/g, "")}`} className="text-base text-primary-foreground underline">
                  {CATO_PHONE}
                </a>
              </div>

              <div className="flex items-center gap-3">
                <FacebookLogo className="h-5 w-5 shrink-0 text-primary-foreground/80" aria-hidden="true" />
                <a
                  href={CATO_FACEBOOK}
                  target="_blank"
                  rel="noreferrer"
                  className="text-base text-primary-foreground underline"
                >
                  facebook.com/CATOPasig
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="h-64 w-full overflow-hidden rounded-lg border border-primary-foreground/30 lg:h-auto lg:min-h-64 lg:flex-1">
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
              className="flex items-center gap-1.5 self-start text-sm text-primary-foreground underline"
            >
              Get directions
              <ArrowSquareOut className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </Section>
        <footer className={`border-t border-primary-foreground/20 ${HERO_TINT} px-6 py-6 text-center text-sm text-primary-foreground/80`}>
          Lakbay Pasig. Places and businesses reviewed by the Pasig City Tourism Office (CATO).{" "}
          <Link to="/privacy" className="underline hover:text-primary-foreground">
            Privacy Policy
          </Link>
        </footer>
      </div>
    </MotionConfig>
  );
}
