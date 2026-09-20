import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Phone, MapPin, Facebook, ExternalLink } from "lucide-react";
import logo from "@/assets/lakbay-pasig-logo.svg";
import { Button } from "@/components/ui/button";
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
function NavAction() {
  const { session, profile } = useAuth();
  const { openAuth } = useAuthModal();
  const navigate = useNavigate();

  // The header itself is now bg-card (light), full page width, per this
  // file's own top comment on LandingHeader -- no longer the dark navy
  // panel this button was originally tuned against. variant="secondary"
  // (bg-secondary navy, secondary-foreground text) now supplies the
  // needed contrast directly, so this no longer needs its own pill
  // override or the "outline" variant's border-stripping.
  if (!session) {
    return (
      <Button onClick={() => openAuth("login")} variant="secondary" size="sm">
        Sign in
      </Button>
    );
  }

  const isStaff = !!profile?.staff_role || profile?.role === "staff";
  const dashboardPath = isStaff ? "/admin" : "/";

  return (
    <Button onClick={() => navigate(dashboardPath)} variant="secondary" size="sm">
      Go to Dashboard
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
// Still translucent + backdrop-blur, "like Apple," per the original
// direct answer -- now over bg-card (this page's own light surfaces)
// rather than bg-secondary/70, since the header spans past the dark hero
// panel into the light About/Features/Contact sections beneath it and a
// navy-tinted translucency would mismatch those.
// Three-part bar (logo / centered links / action) via a 3-column grid,
// per the Notion reference: nav links sit centered as their own group in
// the middle of the bar, independent of the logo's and action's own
// widths, rather than the previous single flex row that grouped links
// with the action on the right. The outer two grid columns are mirrored
// (each 1fr) so the CENTER column -- and the nav links inside it -- stays
// visually centered on the bar as a whole, not just centered between
// wherever the logo and action happen to end; the logo and action each
// sit in their own column with justify-self so they don't stretch.
function LandingHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 grid h-16 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-card/80 px-6 backdrop-blur-md lg:px-12">
      <Link to="/welcome" className="flex items-center gap-2 justify-self-start">
        <img src={logo} alt="Lakbay Pasig" className="h-8 w-8" />
      </Link>

      <nav className="col-start-2 flex items-center gap-6 justify-self-center">
        <a
          href="#top"
          className="hidden text-sm font-medium text-foreground/80 hover:text-foreground sm:inline"
        >
          Home
        </a>
        <a
          href="#about"
          className="hidden text-sm font-medium text-foreground/80 hover:text-foreground sm:inline"
        >
          About
        </a>
        <a
          href="#features"
          className="hidden text-sm font-medium text-foreground/80 hover:text-foreground sm:inline"
        >
          Features
        </a>
        <a
          href="#contact"
          className="hidden text-sm font-medium text-foreground/80 hover:text-foreground sm:inline"
        >
          Contact
        </a>
      </nav>

      <div className="col-start-3 justify-self-end">
        <NavAction />
      </div>
    </header>
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
      {/* Header now renders once here, fixed to the full viewport width
          for the whole page (see LandingHeader's own top comment) --
          pt-16 below matches its h-16 so the hero content underneath
          doesn't start hidden beneath the fixed bar. */}
      <LandingHeader />

      {/* Hero: Notion-style, single centered column, stacked top to
          bottom -- headline, subtitle, CTAs, then the carousel BELOW
          that text (not beside it). HeroLinesBackground is back, per
          direct instruction ("the wave lines should be in the
          background") -- now used as a full-bleed backdrop layer behind
          the ENTIRE hero (headline through carousel), not scoped to a
          left column like the old two-column version. It's an
          absolutely-positioned `inset-0` layer inside this wrapper
          (which is `relative overflow-hidden` for that to work), placed
          first in source order and BEHIND the actual hero content, which
          sits in its own `relative z-10` wrapper on top of it -- so the
          lines read as a backdrop the copy and carousel sit over, never
          on top of or interleaved with them. Unchanged internally:
          still the same left-cluster-only, blue-tinted, bottom-left-
          anchored artwork that component's own top comment documents;
          only where it's mounted changed (full hero backdrop instead of
          one half of a two-column split).

          Top padding: pt-24/pt-28, between the original two-column
          version's pt-32/pt-40 (reported as too much gap above the
          headline) and the very first trim to pt-20/pt-24 (reported as
          cut too far back down) -- splitting the difference per direct
          feedback on both directions rather than picking either extreme
          again.

          HeroCarousel: back to its earlier CONTAINED sizing (max-w-5xl,
          centered, not full-bleed) -- direct instruction: "don't make
          the picture bigger... I liked the size of it before." The
          previous revision's full-bleed treatment (negative-margin
          -mx-6/-mx-12 canceling this wrapper's own padding) was what
          grew it edge-to-edge; that's reverted here. It still has no
          border, rounded corners, or shadow (the still-standing "slap it
          in the background, not a separate outlined/shadowed container"
          instruction from the prior turn), it's just no longer
          full-bleed-wide -- borderless/shadowless and max-w-5xl-
          contained are two independent properties, and only the
          full-bleed WIDTH was the regression here.

          This wrapper's own bg-muted was later dropped too, per direct
          feedback with a screenshot ("change the color so the container
          behind the picture is gone") -- that gray/beige fill was a
          second, literal panel sitting behind the carousel and its
          caption/dots row, visually reading as its own boxed container
          against the hero background, on top of (not the same thing as)
          the wave-lines backdrop fixed the turn before. HeroCarousel's
          own slides (hero-carousel.tsx) already paint their own bg-card
          surface per slide, so this wrapper needed no fill of its own at
          all -- removing bg-muted here doesn't leave a gap, it just
          stops adding a second, redundant panel underneath. */}
      <div className="relative flex flex-col items-center gap-10 overflow-hidden px-6 pb-16 pt-24 text-center lg:px-12 lg:pt-28">
        <HeroLinesBackground />

        <div className="relative z-10 flex max-w-2xl flex-col items-center gap-1">
          <h1 className="text-4xl font-semibold text-foreground lg:text-5xl">
            Lakbay Pasig.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground lg:text-lg">
            A thousand small moments in this city worth living for.
            <br />
            Places that mean more once you know their story.
          </p>
        </div>

        <div className="relative z-10 flex flex-col items-center gap-3 sm:flex-row">
          <Button onClick={() => openAuth("signup")} size="lg" className="flex-1 sm:flex-none">
            Get started
          </Button>
          <Button asChild variant="outline" size="lg" className="flex-1 sm:flex-none">
            <Link to="/">Continue as Guest</Link>
          </Button>
        </div>

        <div className="relative z-10 aspect-[16/10] w-full max-w-5xl overflow-hidden sm:aspect-[16/9]">
          <HeroCarousel slides={heroSlides} />
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
