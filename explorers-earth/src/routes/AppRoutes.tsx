import { Routes, Route } from "react-router-dom";
import useDeviceDetection from "../hooks/useDeviceDetection";
import usePageTracking from "../hooks/usePageTracking";
import StatePreservingRedirect from "./StatePreservingRedirect";

// Import route modules
import AuthRoutes from "./AuthRoutes";
import PublicRoutes from "./PublicRoutes";
import ProtectedRoutes from "./ProtectedRoutes";
import ProtectedRoute from "../components/ProtectedRoute";
import SubscriptionPlans from "../pages/SubscriptionPlans";
import Checkout from "../pages/Checkout";

// Import NotFound page
import NotFound from "../pages/NotFound";

const AppRoutes = () => {
  const { isDesktop } = useDeviceDetection();
  usePageTracking();

  return (
    <Routes>
      {/* Legacy Redirect Routes (handled before PublicRoutes :username/* matching).
          StatePreservingRedirect forwards location.state so callers like
          navigate("/music", { state: { justCreatedList: true } }) don't lose it. */}
      <Route path="/guides" element={<StatePreservingRedirect to="/recommendations/guides" />} />
      <Route path="/music" element={<StatePreservingRedirect to="/recommendations/music" />} />
      <Route path="/hub" element={<StatePreservingRedirect to="/recommendations" />} />

      {/* Auth Routes */}
      {AuthRoutes}

      {/* Protected Routes - these receive the isDesktop prop */}
      {ProtectedRoutes({ isDesktop })}
      
      {/* Test: Subscription Plans route directly in AppRoutes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/subscription-plans" element={<SubscriptionPlans />} />
        <Route path="/checkout" element={<Checkout />} />
      </Route>

      {/* Public Routes */}
      {PublicRoutes}

      {/* Specific 404 route for redirects */}
      <Route path="/404" element={<NotFound />} />

      {/* Catch-all Not Found Route - this will handle any unmatched routes */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
