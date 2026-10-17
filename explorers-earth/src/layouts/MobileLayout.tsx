import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "../components/Header";
import Navbar from "../components/Navbar";
import { DashboardRouteValidator } from "../routes/validators";
import { DashboardThemeProvider } from "../contexts/DashboardThemeContext";
import RouteLoader from "../components/RouteLoader";
import { EarthLoader } from "../components/EarthLoader";
import { CategoryNavigationProvider } from "../features/navigation/CategoryNavigationProvider";
import { MusicPublishProvider } from "../features/music/MusicPublishProvider";
import { verifyMusicPin } from "../features/music/musicPublicationReadiness";

const isMainLandingPage = (path: string): boolean => {
  const mainPaths = [
    /^\/home$/,
    /^\/profile$/,
    /^\/recommendations$/,
    /^\/recommendations\/places$/,
    /^\/analytics$/,
    /^\/settings$/,
    /^\/music$/,
    /^\/recommendations\/movies$/,
    /^\/recommendations\/books$/,
    /^\/recommendations\/games$/,
    /^\/recommendations\/apps$/,
    /^\/recommendations\/products$/,
    /^\/guides$/,
  ];
  return mainPaths.some((regex) => regex.test(path));
};

const MobileLayout = () => {
  const lastScrollTop = useRef(0);
  const location = useLocation();

  // Track initial dashboard load state
  const [isInitialLoading, setIsInitialLoading] = useState(
    !(window as any).__dashboardLoaded && isMainLandingPage(location.pathname)
  );

  useEffect(() => {
    // Reset scroll and header visibility on route change
    window.scrollTo(0, 0);
    document.body.classList.remove('hide-dashboard-header');
    lastScrollTop.current = 0;
  }, [location.pathname]);

  useEffect(() => {
    // If it's already loaded, don't show loader
    if ((window as any).__dashboardLoaded) {
      setIsInitialLoading(false);
      return;
    }

    // Safety timeout: dismiss initial loader after 3.5 seconds anyway
    const safetyTimer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 3500);

    // Setup getter/setter to listen to __dashboardLoaded changes
    let loadedVal = false;
    Object.defineProperty(window, "__dashboardLoaded", {
      get() {
        return loadedVal;
      },
      set(val) {
        loadedVal = val;
        if (val) {
          setIsInitialLoading(false);
        }
      },
      configurable: true,
    });

    return () => {
      clearTimeout(safetyTimer);
      // Clean up descriptor and reset to basic value
      delete (window as any).__dashboardLoaded;
      (window as any).__dashboardLoaded = false;
    };
  }, []);


  useEffect(() => {
    const handleScroll = () => {
      const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollDelta = currentScrollTop - lastScrollTop.current;

      if (currentScrollTop > 20) {
        if (scrollDelta > 0) {
          document.body.classList.add('hide-dashboard-header');
        } else if (scrollDelta < 0) {
          // Keep it hidden on scroll up too, as requested
          document.body.classList.add('hide-dashboard-header');
        }
      } else {
        document.body.classList.remove('hide-dashboard-header');
      }

      lastScrollTop.current = currentScrollTop;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <DashboardThemeProvider>
      <DashboardRouteValidator>
        <div className="dashboard-theme bg-dashboard-bg min-h-screen">
          {isInitialLoading && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-dashboard-bg">
              <EarthLoader context="general" size="default" />
            </div>
          )}
          <Header />
          <RouteLoader />
          <main className="pt-16">
            {location.pathname.startsWith("/recommendations/books") ? <Outlet /> : <CategoryNavigationProvider verifyMusicPin={verifyMusicPin}><MusicPublishProvider><Outlet /></MusicPublishProvider></CategoryNavigationProvider>}
          </main>
          <Navbar />
        </div>
      </DashboardRouteValidator>
    </DashboardThemeProvider>
  );
};

export default MobileLayout;
