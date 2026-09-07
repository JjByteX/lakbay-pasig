import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/lib/protected-route";
import HomePage from "@/pages/home";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import AdminPage from "@/pages/admin";

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
          <Route index element={null} />
          <Route
            path="places"
            element={
              <ProtectedRoute requiredPermission="manage_places">
                <></>
              </ProtectedRoute>
            }
          />
          <Route
            path="businesses"
            element={
              <ProtectedRoute requiredPermission="review_businesses">
                <></>
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
