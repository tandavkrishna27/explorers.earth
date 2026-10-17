import { isCanonicalRuntime, getPublicRuntimeConfig } from "../lib/publicRuntimeConfig";
import { hasAnalyticsConsent } from '../services/explorersAnalyticsClient';

type ClarityQueue = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    dataLayer: any[];
    gtag?: (...args: any[]) => void;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    clarity?: ClarityQueue;
  }
}

// Preserve the destinations previously bootstrapped directly by index.html.
export const GA_MEASUREMENT_ID = 'G-C3QBWP3ZSK';
const CLARITY_PROJECT_ID = 't7xux4xstk';

export const loadAnalytics = (): void => {
  const config = isCanonicalRuntime() ? getPublicRuntimeConfig() : undefined;
  if (config && !config.analytics?.enabled) return;
  if (!hasAnalyticsConsent()) return;
  const measurementId = config?.analytics?.identifier ?? GA_MEASUREMENT_ID;

  // Each vendor is independent: an existing GA global must not skip Clarity.
  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args: unknown[]): void => {
      window.dataLayer.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);

    if (!document.getElementById('ga-script')) {
      const script = document.createElement('script');
      script.id = 'ga-script';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      document.head.appendChild(script);
    }
  }

  if (!config && !window.clarity) {
    const clarity: ClarityQueue = (...args) => {
      (clarity.q ??= []).push(args);
    };
    window.clarity = clarity;
    if (!document.getElementById('clarity-script')) {
      const script = document.createElement('script');
      script.id = 'clarity-script';
      script.async = true;
      script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
      document.head.appendChild(script);
    }
  }
};

export const initAnalytics = (): void => {
  loadAnalytics();
};

export default loadAnalytics;
