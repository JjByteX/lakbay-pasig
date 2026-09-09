import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/lib/protected-route";
import HomePage from "@/pages/home";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
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
import AdminStaffPage from "@/pages/admin-staff";
import AdminStaffDetailPage from "@/pages/admin-staff-detail";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Guest accessible, no session required, per navigation-and-access-control.md */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

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
          <Route
            path="staff"
            element={
              <ProtectedRoute requireAdmin>
                <AdminStaffPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="staff/new"
            element={
              <ProtectedRoute requireAdmin>
                <AdminStaffDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="staff/:id"
            element={
              <ProtectedRoute requireAdmin>
                <AdminStaffDetailPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
