import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { hasAnalyticsConsent } from "../services/explorersAnalyticsClient";
import { GA_MEASUREMENT_ID } from "../utils/analytics";

// Optional typing for global gtag function
declare global {
  interface Window {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    gtag?: (...args: any[]) => void;
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
}

const usePageTracking = () => {
  const location = useLocation();

  useEffect(() => {
    if (!hasAnalyticsConsent()) return;
    window.gtag?.("config", GA_MEASUREMENT_ID, {
      page_path: location.pathname,
    });
  }, [location.pathname]);
};

export default usePageTracking;
