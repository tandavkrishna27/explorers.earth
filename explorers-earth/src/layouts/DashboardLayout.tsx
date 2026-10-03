import { useRef, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidenav";
import Header from "../components/Header";
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

const DashboardLayout = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const location = useLocation();

  // Track initial dashboard load state
  const [isInitialLoading, setIsInitialLoading] = useState(
    !(window as any).__dashboardLoaded && isMainLandingPage(location.pathname)
  );

  // Reset scroll and header visibility on route change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
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


  const handleScroll = () => {
    if (!scrollContainerRef.current) return;

    const currentScrollTop = scrollContainerRef.current.scrollTop;
    const scrollDelta = currentScrollTop - lastScrollTop.current;

    // Only apply logic after a small initial scroll to avoid jitter at the very top
    if (currentScrollTop > 20) {
      if (scrollDelta > 0) {
        // Scrolling down - hide header to give more space
        document.body.classList.add('hide-dashboard-header');
      } else if (scrollDelta < 0) {
        // Scrolling up - the user specifically asked to keep it hidden
        // to avoid clipping the tab switcher on large screens
        document.body.classList.add('hide-dashboard-header');
      }
    } else {
      // Near the very top - always show header
      document.body.classList.remove('hide-dashboard-header');
    }

    lastScrollTop.current = currentScrollTop;
  };

  return (
    <DashboardThemeProvider>
      <DashboardRouteValidator>
        <div className="dashboard-theme flex h-screen bg-dashboard-bg overflow-hidden">
          {isInitialLoading && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-dashboard-bg">
              <EarthLoader context="general" size="default" />
            </div>
          )}
          {/* Sidebar */}
          <Sidebar />

          {/* Main Content - width/margin driven by body[data-sidebar-open] via CSS */}
          <div className="dashboard-content relative flex flex-col bg-dashboard-bg min-w-0">
            <RouteLoader />
            <Header />
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-auto pt-[72px] md:pt-[54px]"
              onScroll={handleScroll}
            >
              {location.pathname.startsWith("/recommendations/books") ? <Outlet /> : <CategoryNavigationProvider verifyMusicPin={verifyMusicPin}><MusicPublishProvider><Outlet /></MusicPublishProvider></CategoryNavigationProvider>}
            </div>
          </div>
        </div>
      </DashboardRouteValidator>
    </DashboardThemeProvider>
  );
};

export default DashboardLayout;
