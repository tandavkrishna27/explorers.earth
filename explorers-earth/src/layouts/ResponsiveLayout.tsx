import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidenav";
import Header from "../components/Header";
import Navbar from "../components/Navbar";
import { DashboardRouteValidator } from "../routes/validators";
import { DashboardThemeProvider } from "../contexts/DashboardThemeContext";
import RouteFallback from "../components/RouteFallback";
import { BootSplash } from "../components/EarthLoader";
import { CategoryNavigationProvider } from "../features/navigation/CategoryNavigationProvider";
import useDeviceDetection from "../hooks/useDeviceDetection";

const isMainLandingPage = (path: string): boolean => {
  const mainPaths = [
    /^\/home$/,
    /^\/profile$/,
    /^\/recommendations$/,
    /^\/recommendations\/(places|movies|books|games|apps|products|people|guides)$/,
    /^\/analytics$/,
    /^\/settings$/,
    /^\/guides$/,
  ];
  return mainPaths.some((regex) => regex.test(path));
};

/**
 * The signed-in shell for both desktop (sidebar + scroll container) and mobile (bottom
 * navbar + window scroll).
 *
 * This used to be two layout components chosen by a window-width check, so crossing 768px
 * swapped the component type above <Outlet />, unmounted the routed page and discarded
 * whatever the user had typed. It is one component with one element tree now: the sidebar
 * and the navbar are conditional siblings (stable slots), everything else only changes
 * its classes, so the routed page keeps its React state across the breakpoint.
 */
const ResponsiveLayout = () => {
  const { isDesktop } = useDeviceDetection();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const location = useLocation();

  const [isInitialLoading, setIsInitialLoading] = useState(
    !(window as any).__dashboardLoaded && isMainLandingPage(location.pathname)
  );

  // Reset scroll and header visibility on route change
  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
    document.body.classList.remove("hide-dashboard-header");
    lastScrollTop.current = 0;
  }, [location.pathname]);

  useEffect(() => {
    if ((window as any).__dashboardLoaded) {
      setIsInitialLoading(false);
      return;
    }

    // Safety timeout: dismiss initial loader after 3.5 seconds anyway
    const safetyTimer = setTimeout(() => setIsInitialLoading(false), 3500);

    let loadedVal = false;
    Object.defineProperty(window, "__dashboardLoaded", {
      get() {
        return loadedVal;
      },
      set(val) {
        loadedVal = val;
        if (val) setIsInitialLoading(false);
      },
      configurable: true,
    });

    return () => {
      clearTimeout(safetyTimer);
      delete (window as any).__dashboardLoaded;
      (window as any).__dashboardLoaded = false;
    };
  }, []);

  // Hide the header while scrolling. Desktop scrolls an inner container, mobile the window.
  const updateHeaderVisibility = (currentScrollTop: number) => {
    if (currentScrollTop > 20) document.body.classList.add("hide-dashboard-header");
    else document.body.classList.remove("hide-dashboard-header");
    lastScrollTop.current = currentScrollTop;
  };

  useEffect(() => {
    if (isDesktop) return;
    const handleScroll = () =>
      updateHeaderVisibility(window.pageYOffset || document.documentElement.scrollTop);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isDesktop]);

  // Suspense keeps the sidebar/header on screen while a route chunk downloads.
  const page = (
    <Suspense fallback={<RouteFallback />}>
      {location.pathname.startsWith("/recommendations/books")
        ? <Outlet />
        : <CategoryNavigationProvider><Outlet /></CategoryNavigationProvider>}
    </Suspense>
  );

  return (
    <DashboardThemeProvider>
      <DashboardRouteValidator>
        <div className={isDesktop
          ? "dashboard-theme flex h-screen bg-dashboard-bg overflow-hidden"
          : "dashboard-theme bg-dashboard-bg min-h-screen"}
        >
          {isInitialLoading && <BootSplash overlay />}
          {isDesktop ? <Sidebar /> : null}

          {/* width/margin driven by body[data-sidebar-open] via CSS on desktop */}
          <div className={isDesktop
            ? "dashboard-content relative flex flex-col bg-dashboard-bg min-w-0"
            : undefined}
          >
            <Header />
            <div
              ref={scrollContainerRef}
              className={isDesktop ? "flex-1 overflow-auto pt-[72px] md:pt-[54px]" : "pt-16"}
              onScroll={isDesktop ? (event) => updateHeaderVisibility(event.currentTarget.scrollTop) : undefined}
            >
              {page}
            </div>
          </div>
          {isDesktop ? null : <Navbar />}
        </div>
      </DashboardRouteValidator>
    </DashboardThemeProvider>
  );
};

export default ResponsiveLayout;
