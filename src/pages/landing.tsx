import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Phone, MapPin, Facebook } from "lucide-react";
import logo from "@/assets/lakbay-pasig-logo.svg";
import { Button } from "@/components/ui/button";
import { HeroCarousel } from "@/components/landing/hero-carousel";
import { fetchActiveSlides, type LandingSlide } from "@/lib/landing-slides";
import { fetchHomeShowcase } from "@/lib/home-query";
import type { CategoryRow } from "@/lib/home-types";
import {
  CategoryPhotoRow,
  CategoryPhotoRowSkeleton,
  type CategoryPhotoRowItem,
} from "@/components/public/category-photo-row";
import { useAuthModal } from "@/lib/auth-modal";
import { usePageTitle } from "@/lib/page-title";
import { useAuth } from "@/lib/auth-context";

/**
 * landing-hero-phases.md Phase 6. Route /welcome, outside PublicShell --
 * per landing-hero-plan.md's Layout Pattern Rules citation, this is a
 * single-purpose entry surface, not a tab in the multi-section app, so
 * it gets no bottom nav, no global search, no sidebar of its own, same
 * reasoning admin-landing.tsx never borrows AdminDataTable for 2 rows.
 *
 * Hero copy shortened post-launch (not in the original landing-hero-
 * plan.md): the original headline carried project-brief.md's full "The
 * Goal" sentence verbatim, which read as a wall of text above the fold.
 * Trimmed to a short headline plus one line, still sourced from the same
 * line rather than invented, not the full sentence restated.
 *
 * Three actions, three distinct triggers, no duplicates elsewhere on the
 * screen, per 6.3: Get started opens the popup in signup mode, Log in
 * opens it in login mode, Continue as Guest is a plain Link to "/". The
 * popup itself (auth-modal.tsx) is a fully separate file/concern, this
 * page only calls into it.
 *
 * About and Contact sections added post-launch, below the hero, same
 * single page (no separate routes, no nav to build for a two-section
 * site). About's copy is project-brief.md's own "The Problem" and "The
 * Goal" lines, not new marketing text, matching how the hero copy above
 * is sourced rather than invented. Contact details (address, email,
 * phone, Facebook) were supplied directly, not found in any project doc
 * -- flagged here rather than fabricated, per decision-log.md entry #17's
 * standing rule on sourcing real content. This page now genuinely
 * exceeds one viewport, so it scrolls; ux-ui-guidelines.md's Layout
 * Pattern Rules calls scrolling appropriate exactly when content volume
 * exceeds a single screen, not before.
 *
 * Top nav, added post-launch per direct spec: logo + Home/About/Features/
 * Contact anchor links + one session-dependent action button (NavAction
 * below). Guest gets Sign in (opens the shared auth popup, same trigger
 * the hero's own Log in button already uses); signed-in gets Go to
 * Dashboard, routed to /admin for staff or "/" for a resident -- two
 * destinations, one label, decided in NavAction rather than branching the
 * whole nav. This is a distinct entry point from the hero's Get started/
 * Log in/Continue as Guest row below it: that row still targets a
 * first-time visitor deciding whether to sign up at all, this bar is for
 * someone who already has a session and either wants back into the app or
 * is re-visiting this page directly (e.g. the profile menu's own new
 * "Home Page" item, see public-shell.tsx's AccountMenu and public-
 * sidebar.tsx).
 *
 * Features section, added post-launch per direct spec: a fourth nav
 * target, placed between About and Contact. Not new marketing copy or a
 * fabricated card grid -- reuses home.tsx's own Places/Businesses photo
 * showcase wholesale (fetchHomeShowcase from home-query.ts, CategoryPhotoRow
 * from category-photo-row.tsx), the exact same live, verified content a
 * signed-in resident sees on their Home feed, so a guest scrolling this
 * page sees real Pasig places and businesses instead of stock-photo
 * placeholders. Works signed out because places_select_public/businesses_
 * select_public (the same RLS policies Discover and Home already read
 * under) are public-readable for verified rows, no session required.
 * Trails and Events are named alongside it as a plain line, not a third
 * live query: trail-card.tsx's own row shape (name/theme/duration, no
 * photo) doesn't match CategoryPhotoRow's photo-tile shape, so folding it
 * into the same strip would look like a broken row rather than a second
 * kind of card, and this page already has one working precedent
 * (Home's own showcase) to reuse rather than inventing a second.
 */
const CATO_ADDRESS = "4th Floor, Pasig Revolving Tower, Market Avenue, Barangay San Nicolas, Pasig City, 1600 Metro Manila";
const CATO_EMAIL = "cato@pasigcity.gov.ph";
const CATO_PHONE = "+63 2 8643 1111";
const CATO_FACEBOOK = "https://www.facebook.com/CATOPasig/";

// Top nav button, session-dependent per direct spec: a guest sees Sign
// in (opens the shared auth popup, same as the hero's own Log in button,
// not a navigate to a separate /login page underneath itself); a signed-
// in staff/admin sees Go to Dashboard (-> /admin, matching App.tsx's
// staff shell root); a signed-in resident sees Go to Dashboard too, but
// routed to "/" (Home feed), per direct answer, since residents have no
// /admin equivalent -- the label stays the same across both signed-in
// cases, only the destination differs, so this isn't a third branch, just
// one signed-in branch with a role-picked target.
function NavAction() {
  const { session, profile } = useAuth();
  const { openAuth } = useAuthModal();
  const navigate = useNavigate();

  if (!session) {
    return (
      <Button onClick={() => openAuth("login")} variant="outline">
        Sign in
      </Button>
    );
  }

  const isStaff = !!profile?.staff_role || profile?.role === "staff";
  const dashboardPath = isStaff ? "/admin" : "/";

  return (
    <Button onClick={() => navigate(dashboardPath)} variant="outline">
      Go to Dashboard
    </Button>
  );
}

export default function LandingPage() {
  usePageTitle("Welcome");

  const navigate = useNavigate();
  const { openAuth } = useAuthModal();

  const [slides, setSlides] = useState<LandingSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const active = await fetchActiveSlides();
        if (!cancelled) setSlides(active);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
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
    load();
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
    featuresBody = <p className="text-sm text-muted-foreground">No verified content yet.</p>;
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
    <div id="top" className="flex min-h-screen flex-col">
      {/* Top nav: logo + Home/About/Features/Contact anchor links + a
          single session-dependent action button, per direct spec. Sits
          above the hero section rather than inside its own px-6/lg:px-16
          wrapper, so it reads as one bar across the full width, matching
          public-shell.tsx's own header row treatment. All four links
          scroll within this same page (id="top" on this outer div,
          #about/#features/#contact ids on those <section>s below) rather
          than navigating, since this is still the single-page layout
          described in this file's own top comment -- Home specifically
          scrolls back up to the hero, the same destination the logo link
          already resolves to visually, just via an in-page anchor instead
          of a route change. */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4 lg:px-16">
        <Link to="/welcome" className="flex items-center gap-2">
          <img src={logo} alt="Lakbay Pasig" className="h-9 w-9" />
        </Link>

        <nav className="flex items-center gap-6">
          <a
            href="#top"
            className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline"
          >
            Home
          </a>
          <a
            href="#about"
            className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline"
          >
            About
          </a>
          <a
            href="#features"
            className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline"
          >
            Features
          </a>
          <a
            href="#contact"
            className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline"
          >
            Contact
          </a>
          <NavAction />
        </nav>
      </header>

      <div className="flex flex-col px-6 py-8 lg:px-16 lg:py-16">
        {/* Two column grid on lg and up, one column below per 6.1. Both
            columns share one vertical center axis via items-center on the
            grid itself, per landing-hero-plan.md's Landing Page section
            ("both columns share one vertical center axis and equal outer
            gutters") and ux-ui-guidelines.md's Symmetry rules. gap-16 is
            the 8px-grid gutter between columns. */}
        <div className="flex flex-1 flex-col items-center justify-center gap-12 py-12 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-0">
          {/* Left column: copy first on mobile per 6.6, so the primary
              action sits above the carousel rather than requiring a scroll
              past it on a common phone height. */}
          <div className="flex w-full max-w-md flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold text-foreground lg:text-4xl">
                Pasig heritage, verified and guided.
              </h1>
              <p className="text-base text-muted-foreground">
                A Tourism Office backed platform for heritage sites, businesses, and guided routes across Pasig.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => openAuth("signup")} className="flex-1">
                Get started
              </Button>
              <Button onClick={() => openAuth("login")} variant="outline" className="flex-1">
                Log in
              </Button>
            </div>

            <Link to="/" className="text-center text-sm text-muted-foreground underline sm:text-left">
              Continue as Guest
            </Link>
          </div>

          {/* Right column: carousel is landing content, so it renders on
              every screen size, stacked below the copy on mobile rather
              than dropping out the way the old auth image panel did, per
              landing-hero-plan.md's Mobile note. Page owns the query per
              hero-carousel.tsx's 4.9, passes slides/loading/error straight
              through so the empty and failed branches (4.8) get their
              first real mount here, per 6.5. */}
          <div className="w-full max-w-xl">
            <HeroCarousel slides={slides} loading={loading} error={error} />
          </div>
        </div>
      </div>

      {/* About: project-brief.md's own Problem/Goal lines, not new copy.
          Same page, own section, flat surface (bg-card) per the
          no-gradient rule, 8px-grid spacing throughout. */}
      <section id="about" className="scroll-mt-20 border-t border-border bg-card px-6 py-16 lg:px-16">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <h2 className="text-2xl font-semibold text-foreground">About</h2>
          <p className="text-base text-muted-foreground">
            Pasig's heritage sites, local businesses, and cultural history sit scattered across generic map
            listings and social media, mixed in with unrelated city posts. Lakbay Pasig ties this content back
            to one source: the Pasig City Tourism Office (CATO).
          </p>
          <p className="text-base text-muted-foreground">
            Every place, business, and trail on this platform is verified by CATO and delivered as sequenced,
            location based storytelling, turning a walk around the city into a guided experience instead of a
            plain search result.
          </p>
        </div>
      </section>

      {/* Features: reuses home.tsx's own Places/Businesses photo showcase
          exactly (fetchHomeShowcase, CategoryPhotoRow), same live verified
          content a signed-in resident's Home feed shows -- not a new
          static feature-card grid. Own section between About and Contact,
          bg-card matching About's flat-surface treatment (alternating
          plain/bg-card down the page, same visual rhythm About/Contact
          already establish between themselves). Trails and Events named
          in a plain closing line rather than a third photo strip, per this
          file's own top comment on why trail-card.tsx's row shape doesn't
          fit this strip. */}
      <section id="features" className="scroll-mt-20 border-t border-border bg-card px-6 py-16 lg:px-16">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold text-foreground">Features</h2>
            <p className="text-base text-muted-foreground">
              A look at what's already verified on the platform -- the same heritage places and local
              businesses a signed-in resident sees on their own Home feed.
            </p>
          </div>

          {featuresBody}

          <p className="text-sm text-muted-foreground">
            Lakbay Pasig also includes guided heritage Trails and CATO-published Events, both unlocked
            once you sign in.
          </p>
        </div>
      </section>

      {/* Contact: real CATO details, not invented. Icon-plus-label per
          ux-ui-guidelines.md's Icon Rules ("always pair icons with a
          visible text label unless universally recognized"), MapPin
          reused from directions-panel.tsx/discover-map.tsx rather than a
          new icon for the same address concept. */}
      <section id="contact" className="scroll-mt-20 border-t border-border px-6 py-16 lg:px-16">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
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
              <Mail className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
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
              <Facebook className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
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
      </section>
    </div>
  );
}
