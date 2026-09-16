import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth-context";
import { AuthModalProvider } from "@/lib/auth-modal";
import { AuthModalRoute } from "@/lib/auth-modal-route";
import { AuthModal } from "@/components/auth/auth-modal";
import { ProtectedRoute } from "@/lib/protected-route";
import { PublicShell } from "@/components/public/public-shell";
import HomePage from "@/pages/home";
import TrailsPage from "@/pages/trails";
import TrailDetailPage from "@/pages/trail-detail";
import DiscoverPage from "@/pages/discover";
import DiscoverPlaceDetailPage from "@/pages/discover-place-detail";
import DiscoverBusinessDetailPage from "@/pages/discover-business-detail";
import EventDetailPage from "@/pages/event-detail";
import SavedPage from "@/pages/saved";
import ProfilePage from "@/pages/profile";
import SettingsPage from "@/pages/settings";
import VendorDashboardPage from "@/pages/vendor-dashboard";
import VendorItemsPage from "@/pages/vendor-items";
import AdminPage from "@/pages/admin";
import AdminDashboardPage from "@/pages/admin-dashboard";
import AdminPlacesPage from "@/pages/admin-places";
import AdminPlaceDetailPage from "@/pages/admin-place-detail";
import AdminDiscoveryContentReviewPage from "@/pages/admin-discovery-content-review";
import AdminBusinessesPage from "@/pages/admin-businesses";
import AdminBusinessDetailPage from "@/pages/admin-business-detail";
import AdminEventsPage from "@/pages/admin-events";
import AdminEventDetailPage from "@/pages/admin-event-detail";
import AdminTrailsPage from "@/pages/admin-trails";
import AdminTrailBuilderPage from "@/pages/admin-trail-builder";
import AdminCategoriesPage from "@/pages/admin-categories";
import AdminLandingPage from "@/pages/admin-landing";
import AdminStaffPage from "@/pages/admin-staff";
import AdminSettingsPage from "@/pages/admin-settings";
import LandingPage from "@/pages/landing";

export default function App() {
  return (
    <AuthProvider>
      <AuthModalProvider>
        <Routes>
          {/* Public shell, five tabs per navigation-and-access-control.md's
              Bottom Nav Order, Guest accessible, no session required. home.tsx
              previously owned "/" directly; the shell takes over as root here
              per step-5-phases.md Phase 2.5, home.tsx now renders as the
              index child instead. Only Discover is a real screen this step,
              the other three are stub routes per Phase 2.4. */}
          <Route path="/" element={<PublicShell />}>
            <Route index element={<HomePage />} />
            <Route path="trails" element={<TrailsPage />} />
            {/* Phase 2.1 (step-7-phases.md): detail route, no auth gate on
                the route itself, per navigation-and-access-control.md's
                Guest full-preview rule for Trails (full browse access
                including stop list, duration, and budget preview; sign-in
                only gates starting/tracking/saving/finishing, Phase 4's
                concern). Page itself is a stub until Phase 3 builds it out. */}
            <Route path="trails/:id" element={<TrailDetailPage />} />
            <Route path="discover" element={<DiscoverPage />} />
            {/* Phase 6.2 (step-5-phases.md): full record detail, separate
                from the Phase 6.1 preview card (result-card.tsx's modal).
                Nested under the shell, not standalone, per ux-ui-
                guidelines.md's Layout Shell Rules, the bottom nav and top
                bar are persistent chrome on every public page, a drill-down
                detail page is still part of the public app, not a dead end
                outside it. Two routes, not one branching on the type
                discriminator, since 6.3/6.4 name genuinely different field
                sets per kind, matching admin's own split between
                admin-place-detail.tsx and admin-business-detail.tsx rather
                than one component doing both shapes. */}
            <Route path="discover/place/:id" element={<DiscoverPlaceDetailPage />} />
            <Route path="discover/business/:id" element={<DiscoverBusinessDetailPage />} />
            {/* Phase 4.4 (step-6-phases.md): same nesting as the two discover
                detail routes above, not top level, so the bottom nav and top
                bar stay visible per ux-ui-guidelines.md's Layout Shell Rules.
                Reached from AnnouncementCarousel's tile click (home.tsx). */}
            <Route path="events/:id" element={<EventDetailPage />} />
            <Route path="saved" element={<SavedPage />} />
            <Route path="profile" element={<ProfilePage />} />
            {/* Settings: Personalization, Phase 2.1: no ProtectedRoute
                wrapper, same reasoning as saved, profile, and vendor above --
                navigation-and-access-control.md's Profile is "locked, prompt
                to sign in" for a Guest, not redirected. Nested under profile
                since Settings lives inside Profile per settings-
                personalization-plan.md, not a sixth bottom-nav destination. */}
            <Route path="profile/settings" element={<SettingsPage />} />
            {/* Step 9, Phase 2.1: no ProtectedRoute wrapper, same reasoning
                as saved and profile above, navigation-and-access-control.md
                treats Vendor entry as locked-with-prompt, not redirected.
                Each page owns its own signed-in check. */}
            <Route path="vendor" element={<VendorDashboardPage />} />
            <Route path="vendor/items" element={<VendorItemsPage />} />
          </Route>
          {/* landing-hero-phases.md Phase 6.7: single-purpose entry
              surface, outside PublicShell (no bottom nav, no global
              search, no sidebar), per ux-ui-guidelines.md's Layout
              Pattern Rules -- same reasoning /login and /signup below
              render this same page underneath their popup rather than
              their own duplicate layout. */}
          <Route path="/welcome" element={<LandingPage />} />
          {/* landing-hero-phases.md Phase 6.8: opens the popup in the
              matching mode with the landing page rendered underneath, so
              the popup has a surface to sit on. These stay routes (not
              folded into the popup's own state) per landing-hero-
              plan.md's Flagged Conflicts #4: Supabase email confirmation
              links point here, protected-route.tsx needs a real redirect
              target for a signed-out admin hit, and existing bookmarks
              keep working. */}
          <Route path="/login" element={<AuthModalRoute mode="login" />} />
          <Route path="/signup" element={<AuthModalRoute mode="signup" />} />

          {/* Staff shell, sections render inside its Outlet, gated per admin-panel-spec.md */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireStaff>
                <AdminPage />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route
              path="places"
              element={
                <ProtectedRoute requiredPermission="manage_places">
                  <AdminPlacesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="places/new"
              element={
                <ProtectedRoute requiredPermission="manage_places">
                  <AdminPlaceDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="places/:id"
              element={
                <ProtectedRoute requiredPermission="manage_places">
                  <AdminPlaceDetailPage />
                </ProtectedRoute>
              }
            />
            {/* Phase 5.3: flagged discovery_content ("Trail Content") rows,
                reviewed from the same Places queue, per step-4-plan.md's
                review exception. Gated on manage_places, matching the queue
                this route is reached from — migration 0013 grants
                discovery_content RLS to manage_places specifically for this
                (phase-5-decisions.md Decision 2), a build_trails staffer
                with no manage_places permission does not see this queue at
                all, so this route doesn't need to also accept build_trails. */}
            <Route
              path="places/discovery/:id"
              element={
                <ProtectedRoute requiredPermission="manage_places">
                  <AdminDiscoveryContentReviewPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="businesses"
              element={
                <ProtectedRoute requiredPermission="review_businesses">
                  <AdminBusinessesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="businesses/:id"
              element={
                <ProtectedRoute requiredPermission="review_businesses">
                  <AdminBusinessDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="events"
              element={
                <ProtectedRoute requiredPermission="publish_events">
                  <AdminEventsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="events/new"
              element={
                <ProtectedRoute requiredPermission="publish_events">
                  <AdminEventDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="events/:id"
              element={
                <ProtectedRoute requiredPermission="publish_events">
                  <AdminEventDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="trails"
              element={
                <ProtectedRoute requiredPermission="build_trails">
                  <AdminTrailsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="trails/new"
              element={
                <ProtectedRoute requiredPermission="build_trails">
                  <AdminTrailBuilderPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="trails/:id"
              element={
                <ProtectedRoute requiredPermission="build_trails">
                  <AdminTrailBuilderPage />
                </ProtectedRoute>
              }
            />
            {/* Category Directory, Phase 2.2: one tabbed page (Places /
                Trails / Announcements), not three routes. Permission check
                is "any of manage_places, build_trails, or publish_events,"
                since any one of the three tabs qualifies someone to open
                the page at all -- which tabs actually render once inside is
                decided per tab (Phase 2.4), this route only gates entry to
                the page as a whole. admin bypasses this check the same way
                it bypasses every other requiredPermission, per
                protected-route.tsx's existing admin-bypass behavior.

                Category Directory Expansion, Phase 2.2: review_businesses
                added, mirroring admin-sidebar.tsx's own Phase 2.1 edit, so
                the route guard and the sidebar visibility stay in sync --
                the new Business Category tab (Phase 2.3) now qualifies a
                staff member with only that permission to open this page. */}
            <Route
              path="categories"
              element={
                <ProtectedRoute
                  requiredPermission={["manage_places", "build_trails", "publish_events", "review_businesses"]}
                >
                  <AdminCategoriesPage />
                </ProtectedRoute>
              }
            />
            {/* Landing Page, landing-hero-phases.md Phase 3.2. Gated on its
                own permission (manage_landing, migration 0033), matching
                admin-sidebar.tsx's Phase 3.1 nav item exactly so the route
                guard and the sidebar visibility stay in sync, same pattern
                every other content section in this file already follows. */}
            <Route
              path="landing"
              element={
                <ProtectedRoute requiredPermission="manage_landing">
                  <AdminLandingPage />
                </ProtectedRoute>
              }
            />
            {/* New/Edit staff open in a modal (StaffFormDialog, rendered from
                AdminStaffPage itself) instead of separate routes, per
                ux-ui-guidelines.md's Modal vs panel rule. staff/new and
                staff/:id previously routed to admin-staff-detail.tsx, now
                removed. */}
            <Route
              path="staff"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminStaffPage />
                </ProtectedRoute>
              }
            />
            {/* Staff-facing Settings: theme/font size preference, same
                profiles.theme_preference/font_size_preference columns and
                same preferences.ts mechanism settings.tsx (Profile ->
                Settings) already uses, but reachable from inside /admin --
                no route under PublicShell was ever reachable by a staff
                session, so staff had no UI for a preference the app
                already applied for every session regardless of role. No
                ProtectedRoute wrapper needed beyond the outer /admin
                route's own requireStaff: this is a personal display
                preference, not a content section, so it's visible to
                every staff member the same way Dashboard is, no
                requiredPermission and no adminOnly, confirmed directly
                against admin-panel-spec.md's Access Rule before adding. */}
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Routes>
        <AuthModal />
      </AuthModalProvider>
    </AuthProvider>
  );
}
