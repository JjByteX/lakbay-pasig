import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Phone, MapPin, Facebook, ExternalLink } from "lucide-react";
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
 * Landing redesign (split hero), per direct reference image + spec:
 * the hero is now a two-column split, left column dark (bg-secondary,
 * the brand navy token, not a new hardcoded color) carrying the nav,
 * headline, and CTAs; right column is HeroCarousel's own new `fill`
 * variant (hero-carousel.tsx), running the full viewport height with no
 * bar cutting into it -- matching the reference's photo/video panel
 * exactly, "keep what it is today" per direct answer (same slides query,
 * same admin-managed content, just laid out full-bleed instead of a
 * small bordered card). The header sits inside the left column only
 * (sticky, translucent, backdrop-blur -- "like Apple," per direct
 * answer), it does not span both columns the way the previous single-
 * column layout's header did.
 *
 * Hero copy shortened post-launch (not in the original landing-hero-
 * plan.md): the original headline carried project-brief.md's full "The
 * Goal" sentence verbatim, which read as a wall of text above the fold.
 * Trimmed to a short headline plus one line, still sourced from the same
 * line rather than invented, not the full sentence restated.
 *
 * Three actions, three distinct triggers, no duplicates elsewhere on the
 * screen, per 6.3: Get started opens the popup in signup mode, Continue
 * as Guest is a plain Link to "/". Log in is deliberately NOT repeated
 * here anymore -- ux-ui-guidelines.md's "one action, one trigger, one
 * place" rule (What Must Never Happen: "if a Sign In link exists in the
 * header, there is no Sign In button elsewhere on the same screen") means
 * the header's own NavAction (Sign in / Go to Dashboard) is now the only
 * sign-in trigger on this page; the old second Log in button next to Get
 * started was a duplicate of it and has been removed. The popup itself
 * (auth-modal.tsx) is a fully separate file/concern, this page only calls
 * into it.
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
function NavAction() {
  const { session, profile } = useAuth();
  const { openAuth } = useAuthModal();
  const navigate = useNavigate();

  // variant="secondary" is bg-secondary, the same navy as this header's
  // own background (LandingHeader below) -- invisible against it. The
  // reference image's own pill button is light against the dark panel,
  // so this uses a plain light pill (bg-card via the existing "outline"
  // variant, no border needed here since the header's own translucent
  // bg already provides the separation) rather than a new button
  // variant just for this one dark-panel case.
  const pillClass = "border-0 bg-card text-foreground hover:bg-card/90";

  if (!session) {
    return (
      <Button onClick={() => openAuth("login")} variant="outline" size="sm" className={pillClass}>
        Sign in
      </Button>
    );
  }

  const isStaff = !!profile?.staff_role || profile?.role === "staff";
  const dashboardPath = isStaff ? "/admin" : "/";

  return (
    <Button onClick={() => navigate(dashboardPath)} variant="outline" size="sm" className={pillClass}>
      Go to Dashboard
    </Button>
  );
}

// Header, now scoped to the left (dark) column only, not the full page
// width -- matches the reference image's nav sitting inside the dark
// panel, not spanning above both columns. Sticky + translucent +
// backdrop-blur, "like Apple," per direct answer: fixed to the top of
// its own column while the column's content scrolls beneath it, same
// sticky top-0 z-10 convention admin-data-table.tsx's own sticky header
// already establishes in this codebase, extended here with a translucent
// bg + backdrop-blur rather than admin-data-table's opaque bg-card, since
// that file's header has no dark hero image behind it to blur.
function LandingHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-secondary/70 px-6 py-4 backdrop-blur-md lg:px-12">
      <Link to="/welcome" className="flex items-center gap-2">
        <img src={logo} alt="Lakbay Pasig" className="h-8 w-8" />
      </Link>

      <nav className="flex items-center gap-6">
        <a
          href="#top"
          className="hidden text-sm font-medium text-secondary-foreground/80 hover:text-secondary-foreground sm:inline"
        >
          Home
        </a>
        <a
          href="#about"
          className="hidden text-sm font-medium text-secondary-foreground/80 hover:text-secondary-foreground sm:inline"
        >
          About
        </a>
        <a
          href="#features"
          className="hidden text-sm font-medium text-secondary-foreground/80 hover:text-secondary-foreground sm:inline"
        >
          Features
        </a>
        <a
          href="#contact"
          className="hidden text-sm font-medium text-secondary-foreground/80 hover:text-secondary-foreground sm:inline"
        >
          Contact
        </a>
        <NavAction />
      </nav>
    </header>
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
      {/* Hero: two-column split per the reference image. Left column is
          the dark navy panel (bg-secondary, the brand token, matches the
          reference's dark left panel color without inventing a new hex
          value) holding the header, headline, and CTAs; right column is
          the full-height HeroCarousel "fill" variant, per direct answer
          ("keep what it is today... just make it occupy the whole space
          from top to bottom with no top bar") -- the header lives only in
          the left column (LandingHeader above), so the right panel is
          never cut into by a bar.

          Height chain, fixed after the initial build shipped with a blank
          right panel: the grid container itself now carries lg:min-h-screen
          (a real, resolvable height), not just its left child -- CSS
          Grid's stretch only has something to stretch into once the
          container's own row height is set. The right column then uses
          lg:h-full (resolves against that definite parent height) instead
          of lg:h-auto (had nothing to measure, since HeroCarousel's `fill`
          tiles are all position:absolute and contribute zero intrinsic
          height to an h-auto box) -- h-auto was collapsing this column to
          0px, rendering neither the carousel nor its fallback panel, even
          though both were mounted and receiving real data. Left column
          drops to lg:min-h-0 so it no longer double-forces a second,
          possibly-conflicting min-height once the grid container already
          guarantees the row's height itself.

          lg:grid-cols-2, mobile stacks to one column (left content above,
          right carousel below) since a true side-by-side split has no
          room to breathe at phone widths, same mobile-stacks-vertically
          pattern the original two-column hero already used. */}
      <div className="flex flex-col lg:grid lg:min-h-screen lg:grid-cols-2">
        <div className="flex min-h-screen flex-col bg-secondary lg:min-h-0">
          <LandingHeader />

          <div className="flex flex-1 flex-col justify-center gap-8 px-6 py-16 lg:px-12">
            <div className="flex flex-col gap-4">
              <h1 className="text-4xl font-semibold text-secondary-foreground lg:text-5xl">
                Pasig heritage, verified and guided.
              </h1>
              <p className="max-w-md text-base text-secondary-foreground/70">
                A Tourism Office backed platform for heritage sites, businesses, and guided routes across
                Pasig -- every listing verified by CATO before it reaches you.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => openAuth("signup")} size="lg" className="flex-1 sm:flex-none">
                Get started
              </Button>
              <Link
                to="/"
                className="flex items-center justify-center text-center text-sm text-secondary-foreground/70 underline underline-offset-4 hover:text-secondary-foreground sm:justify-start"
              >
                Continue as Guest
              </Link>
            </div>
          </div>
        </div>

        <div className="h-80 w-full sm:h-96 lg:h-full">
          <HeroCarousel slides={slides} loading={loading} error={error} fill />
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
          plain surface (alternating with About's/Contact's bg-card,
          same visual rhythm those two already establish between
          themselves). Trails and Events named in a plain closing line
          rather than a third photo strip, per this file's own top comment
          on why trail-card.tsx's row shape doesn't fit this strip. */}
      <section id="features" className="scroll-mt-20 border-t border-border px-6 py-16 lg:px-16">
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
      <section id="contact" className="scroll-mt-20 border-t border-border bg-card px-6 py-16 lg:px-16">
        <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2">
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

          <div className="flex flex-col gap-3">
            <div className="h-64 w-full overflow-hidden rounded-lg border border-border lg:h-full lg:min-h-64">
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
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
