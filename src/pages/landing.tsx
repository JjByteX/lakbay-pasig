import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logo from "@/assets/lakbay-pasig-logo.svg";
import { Button } from "@/components/ui/button";
import { HeroCarousel } from "@/components/landing/hero-carousel";
import { fetchActiveSlides, type LandingSlide } from "@/lib/landing-slides";
import { useAuthModal } from "@/lib/auth-modal";
import { usePageTitle } from "@/lib/page-title";

/**
 * landing-hero-phases.md Phase 6. Route /welcome, outside PublicShell --
 * per landing-hero-plan.md's Layout Pattern Rules citation, this is a
 * single-purpose entry surface, not a tab in the multi-section app, so
 * it gets no bottom nav, no global search, no sidebar of its own, same
 * reasoning admin-landing.tsx never borrows AdminDataTable for 2 rows.
 *
 * Copy is sourced, not invented: the headline/pitch below are
 * project-brief.md's "The Goal" line and build-priorities.md's "The One
 * Line Pitch" verbatim, per 6.2 -- this page writes no new marketing
 * text.
 *
 * Three actions, three distinct triggers, no duplicates elsewhere on the
 * screen, per 6.3: Get started opens the popup in signup mode, Log in
 * opens it in login mode, Continue as Guest is a plain Link to "/". The
 * popup itself (auth-modal.tsx) is a fully separate file/concern, this
 * page only calls into it.
 */
export default function LandingPage() {
  usePageTitle("Welcome");

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

  return (
    <div className="flex min-h-screen flex-col px-6 py-8 lg:px-16 lg:py-16">
      <img src={logo} alt="Lakbay Pasig" className="h-12 w-12" />

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
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-semibold text-foreground lg:text-4xl">
              A Tourism Office backed platform for Pasig heritage sites, businesses, and guided routes,
              verified by CATO and delivered through sequenced, location based storytelling.
            </h1>
            <p className="text-base text-muted-foreground">
              Google Maps tells tourists what is nearby. This app is Pasig City's own platform for telling
              its own story, kept current by the Tourism Office, turning a walk around the city into a
              guided experience instead of a plain search result.
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
  );
}
