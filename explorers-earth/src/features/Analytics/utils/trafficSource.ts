import type { AnalyticsEvent } from '../api/queries';

type TrafficAttribution = Pick<AnalyticsEvent, 'utmParams' | 'referrerOrigin'>;

export function resolveTrafficSource(event: TrafficAttribution): string {
  const utmSource = event.utmParams?.utm_source?.trim();
  if (utmSource) return utmSource;

  if (event.referrerOrigin) {
    try {
      const hostname = new URL(event.referrerOrigin).hostname
        .toLowerCase()
        .replace(/^www\./, '');
      if (hostname) return hostname;
    } catch {
      // Invalid legacy data is classified as direct rather than breaking charts.
    }
  }
  return 'direct';
}
