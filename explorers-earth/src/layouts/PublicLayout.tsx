import { useCallback, useEffect, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PublicNav from "../components/PublicNav";
import {
  usePublicAccountIdentity,
} from "../features/music/PublicMusicAvailabilityProvider";
import PublicProfileThemeProvider from "../features/PublicHome/components/PublicProfileThemeProvider";
import { usePublicColdEntry } from "./PublicColdEntryBoundary";
import PublicRouteErrorBoundary from "./PublicRouteErrorBoundary";

function PublicLayoutInner() {
  const location = useLocation();
  const accountIdentity = usePublicAccountIdentity();
  const cold = usePublicColdEntry();

  useEffect(() => {
    cold.reportIdentity(accountIdentity.status);
  }, [accountIdentity.status, cold.reportIdentity]);

  const setIsPageLoaded = useCallback((loaded: boolean) => {
    cold.reportRouteReady(loaded);
  }, [cold.reportRouteReady]);
  const outletContext = useMemo(() => ({
    isPageLoaded: cold.routeReady,
    isShellRevealed: cold.shellRevealed,
    setIsPageLoaded,
  }), [cold.routeReady, cold.shellRevealed, setIsPageLoaded]);
  const reportTerminal = useCallback((caughtRouteKey: string) => {
    if (caughtRouteKey === cold.contentRouteKey) cold.reportRouteReady(true);
  }, [cold.contentRouteKey, cold.reportRouteReady]);
  const isMapRoute = location.pathname.includes("/map") || location.pathname.includes("/placesmap");

  return <PublicProfileThemeProvider
    showShellChrome={cold.shellRevealed}
    navigation={cold.shellRevealed && !isMapRoute ? <PublicNav /> : undefined}
  >
    <main>
      <PublicRouteErrorBoundary
        key={cold.contentRouteKey}
        contentRouteKey={cold.contentRouteKey}
        usernameKey={cold.usernameKey}
        shellRevealed={cold.shellRevealed}
        reportTerminal={reportTerminal}
      >
        <Outlet context={outletContext} />
      </PublicRouteErrorBoundary>
    </main>
  </PublicProfileThemeProvider>;
}

const PublicLayout = () => <PublicLayoutInner />;

export default PublicLayout;
