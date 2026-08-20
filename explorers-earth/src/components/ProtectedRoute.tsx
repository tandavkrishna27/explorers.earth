import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { gql } from "@apollo/client";
import useAuthStore from "../store/store";
import { useLogout } from "../hooks/useLogout";
import { EarthLoader } from "./EarthLoader";
import OnboardingCheckError from "./OnboardingCheckError";

const checkOnboardingStatusQuery = gql`
  query CheckOnboardingStatus($documentId: ID!) {
    usersPermissionsUser(documentId: $documentId) {
      accounts {
        Account_Name
        Account_Type
        mobile_number
      }
    }
  }
`;

const ProtectedRoute = () => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  const { data, loading, error, refetch } = useQuery(checkOnboardingStatusQuery, {
    variables: { documentId: user?.documentId },
    skip: !user?.documentId,
    fetchPolicy: "cache-first", // Use cache to speed up navigation
    nextFetchPolicy: "cache-first",
    errorPolicy: "all", // keep any partial data alongside errors
  });
  const logout = useLogout();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // While the check is still loading, show the loader.
  if (loading) {
    const savedTheme = localStorage.getItem('dashboard-theme');
    const isDark = savedTheme === 'dark' || !savedTheme;
    return (
      <div className={`dashboard-theme ${isDark ? 'dashboard-theme-dark' : ''} bg-dashboard-bg min-h-screen flex items-center justify-center`}>
        <EarthLoader context="general" size="default" />
      </div>
    );
  }

  // Onboarding is complete only when the account positively has all mandatory
  // fields. Compute it first so the error guard can distinguish "verified
  // complete" from "unknown / partial".
  const account = data?.usersPermissionsUser?.accounts?.[0];
  const isAccountComplete = !!(
    account &&
    account.Account_Name &&
    account.Account_Type &&
    account.mobile_number
  );

  // On any query error, only trust the response if it POSITIVELY establishes a
  // complete account. With errorPolicy:"all", a field-level failure can return a
  // truthy-but-partial object (e.g. { usersPermissionsUser: null }, or an account
  // missing mobile_number) alongside the error — which must NOT be read as "not
  // onboarded" and bounce an already-onboarded user to /onboarding. Show the
  // recoverable state (retry / log out) instead; there's no perpetual loader, so a
  // persistent error can't lock the user out.
  if (error && !isAccountComplete) {
    return <OnboardingCheckError onRetry={() => { refetch(); }} onLogout={() => { logout(); }} />;
  }

  const isOnboardingRequired = !isAccountComplete;

  const allowedDuringOnboarding = [
    "/onboarding",
    "/music",
    "/recommendations/music",
    "/instagram",
    "/subscription-plans",
    "/checkout"
  ];

  const isAllowedRoute = allowedDuringOnboarding.includes(location.pathname);

  // Debug logging
  console.log("ProtectedRoute - pathname:", location.pathname, "isAllowedRoute:", isAllowedRoute, "isOnboardingRequired:", isOnboardingRequired);

  // Always allow subscription-plans, music, and onboarding routes
  if (isAllowedRoute) {
    // If we're on the onboarding page but onboarding is not required, redirect to home
    if (location.pathname === "/onboarding" && !isOnboardingRequired) {
      return <Navigate to="/home" replace />;
    }
    // Otherwise, show the allowed route
    return <Outlet />;
  }

  // For all other protected routes, check if onboarding is required
  if (isOnboardingRequired) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
