import { Navigate, Outlet, useLocation } from "react-router-dom";
import useAuthStore from "../store/store";
import { useLogout } from "../hooks/useLogout";
import { EarthLoader } from "./EarthLoader";
import OnboardingCheckError from "./OnboardingCheckError";
import { useCanonicalAccount } from "../features/Profile/api/useCanonicalAccount";
import { authClient } from "../lib/authClient";

export default function ProtectedRoute() {
  const { status, isAuthenticated } = useAuthStore();
  const location = useLocation();
  const logout = useLogout();
  const active = isAuthenticated && (status === "active-incomplete" || status === "active-complete");
  const account = useCanonicalAccount({ skip: !active });
  if (status === "loading") return <EarthLoader context="general" size="default" />;
  if (status === "error") return <OnboardingCheckError onRetry={() => { void authClient.refresh(); }} onLogout={logout} />;
  if (status === "terminal") return <Navigate to="/reactivate" replace />;
  if (status === "recovery-only") return <Navigate to="/reactivate-confirm" replace />;
  if (!active) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (account.isLoading) return <EarthLoader context="general" size="default" />;
  if (account.error || !account.data) return <OnboardingCheckError onRetry={() => { void account.refetch(); }} onLogout={logout} />;
  const complete = account.data.onboardingStatus === "complete";
  const allowedDuringOnboarding = ["/onboarding", "/music", "/recommendations/music", "/instagram", "/subscription-plans", "/checkout"];
  if (allowedDuringOnboarding.includes(location.pathname)) {
    if (location.pathname === "/onboarding" && complete) return <Navigate to="/home" replace />;
    return <Outlet />;
  }
  if (!complete) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
