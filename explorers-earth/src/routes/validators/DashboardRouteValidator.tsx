import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import useDeviceDetection from "../../hooks/useDeviceDetection";

interface DashboardRouteValidatorProps {
  children: React.ReactNode;
}

const DashboardRouteValidator = ({
  children,
}: DashboardRouteValidatorProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDesktop } = useDeviceDetection();

  useEffect(() => {
    // Define valid dashboard route patterns
    const validRoutePatterns = [
      /^\/home$/,
      /^\/profile$/,
      /^\/recommendations$/,
      ...(!isDesktop ? [/^\/hub$/] : []),
      /^\/recommendations\/places$/,
      /^\/analytics$/,
      /^\/settings$/,
      /^\/music$/,
      /^\/recommendations\/music(\/.*)?$/, // Music routes
      /^\/instagram$/,
      /^\/onboarding$/,
      /^\/guides(\/.*)?$/,
      /^\/recommendations\/guides(\/.*)?$/, // All guides routes
      /^\/recommendations\/movies(\/.*)?$/, // All movies & shows routes
      /^\/recommendations\/books(\/.*)?$/, // All books routes
      /^\/recommendations\/games(\/.*)?$/, // All games routes
      /^\/recommendations\/apps(\/.*)?$/, // All apps & tools routes
      /^\/recommendations\/products(\/.*)?$/, // All products routes
      /^\/recommendations\/people(\/.*)?$/, // All people routes
      /^\/recommendations\/places\/[^/]+\/add-people$/, // Add linked people to a location
      /^\/recommendations\/places\/[^/]+\/add-products$/, // Add linked products to a location
      /^\/[^/]+\/new$/, // Dynamic routes like /:listId/new
      /^\/[^/]+\/edit$/, // Dynamic routes like /:placeId/edit
    ];


    // Check if current path matches any valid pattern
    const currentPath = location.pathname;
    const isValidRoute = validRoutePatterns.some((pattern) =>
      pattern.test(currentPath)
    );

    if (!isValidRoute) {
      // Redirect to NotFound page for invalid dashboard routes
      navigate("/404", { replace: true });
    }
  }, [location.pathname, navigate]);

  return <>{children}</>;
};

export default DashboardRouteValidator;
