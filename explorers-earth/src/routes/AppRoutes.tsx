import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import RouteFallback from "../components/RouteFallback";
import usePageTracking from "../hooks/usePageTracking";
import StatePreservingRedirect from "./StatePreservingRedirect";

// Import route modules
import AuthRoutes from "./AuthRoutes";
import PublicRoutes from "./PublicRoutes";
import ProtectedRoutes from "./ProtectedRoutes";
import ProtectedRoute from "../components/ProtectedRoute";

// Import NotFound page
import NotFound from "../pages/NotFound";

const AppRoutes = () => {
  usePageTracking();

  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      {/* Legacy Redirect Routes (handled before PublicRoutes :username/* matching).
          StatePreservingRedirect forwards location.state to the target page.
          /music stays registered after Music's removal so it is not read as a
          profile named "music". */}
      <Route path="/guides" element={<StatePreservingRedirect to="/recommendations/guides" />} />
      <Route path="/music/*" element={<StatePreservingRedirect to="/recommendations" />} />
      <Route path="/hub" element={<StatePreservingRedirect to="/recommendations" />} />

      {/* Auth Routes */}
      {AuthRoutes}

      {/* Protected Routes */}
      {ProtectedRoutes()}
      
      {/* Test: Subscription Plans route directly in AppRoutes */}
      <Route element={<ProtectedRoute />}>
      </Route>

      {/* Public Routes */}
      {PublicRoutes}

      {/* Specific 404 route for redirects */}
      <Route path="/404" element={<NotFound />} />

      {/* Catch-all Not Found Route - this will handle any unmatched routes */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
};

export default AppRoutes;
