import { useCallback, useEffect, useRef, useState } from 'react';
import useAuthStore from '../store/store';
import {
  getSessionAttributionUtmParams,
  getSessionAttributionReferrerOrigin,
  type UTMParameters,
} from '../utils/urlHelpers';
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  createAnalyticsEventId,
  hasAnalyticsConsent,
  postExplorersAnalyticsEvent,
} from './explorersAnalyticsClient';

export interface AnalyticsEvent {
  type: 'view' | 'click' | 'interaction';
  timestamp: string;
  page: string;
  element?: string;
  metadata?: Record<string, unknown>;
  utmParams?: UTMParameters;
  referrerOrigin?: string;
  country?: string | null;
}

type TrackableEvent = Omit<AnalyticsEvent, 'timestamp' | 'page' | 'country'>;

export interface AnalyticsData {
  Account_Id: string;
  Location_Id?: string | null;
  Recommendation_Id?: string | null;
  Stats: AnalyticsEvent[];
}

export interface UseTrackAnalyticsOptions {
  accountId: string;
  locationId?: string | null;
  recommendationId?: string | null;
  pageName: string;
  pageUsername?: string;
  autoTrackView?: boolean;
  waitForLocation?: boolean;
  cityName?: string;
}

export interface UseTrackAnalyticsReturn {
  trackEvent: (event: TrackableEvent) => Promise<boolean>;
  trackView: () => Promise<void>;
  trackClick: (element: string, metadata?: Record<string, unknown>) => void;
  trackInteraction: (element: string, metadata?: Record<string, unknown>) => void;
  loading: boolean;
  error: string | null;
}

const allowedMetadataKeys = new Set([
  'action',
  'index',
  'totalItems',
  'context',
  'platform',
  'originalElement',
  'cityId',
  'cityName',
  'cityname',
  'viewType',
  'recommendationId',
  'placeId',
  'placeName',
  'category',
  'recommendationType',
  'id',
  'title',
  'authors',
  'listId',
  'listName',
  'mediaType',
  'genres',
  'guideType',
  'artist',
  'youtubeId',
  'placeSlug',
  'selectedCity',
]);

const pagesWithCanonicalContentTargets = new Set([
  'public-home',
  'recommendation-detail',
  'public-guides',
  'public-movies',
  'public-books',
  'public-games',
  'public-apps',
  'public-products',
  'public-people',
]);

function privacySafeMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const entries: Array<[string, string | number | boolean]> = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedMetadataKeys.has(key)) continue;
    if (typeof child === 'string') {
      const bounded = child.trim().slice(0, 512);
      if (bounded) entries.push([key, bounded]);
      continue;
    }
    if (typeof child === 'number' && Number.isFinite(child)) {
      entries.push([key, child]);
      continue;
    }
    if (typeof child === 'boolean') entries.push([key, child]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export const useTrackAnalytics = (
  options: UseTrackAnalyticsOptions,
): UseTrackAnalyticsReturn => {
  const {
    accountId,
    locationId,
    recommendationId,
    pageName,
    pageUsername,
    autoTrackView = true,
    waitForLocation = false,
    cityName,
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTrackedView, setHasTrackedView] = useState(false);
  const [hasConsent, setHasConsent] = useState(hasAnalyticsConsent);
  const canonicalPath = window.location.pathname;
  const inFlight = useRef(new Set<string>());
  const lastCallTime = useRef(new Map<string, number>());
  const retryEventIds = useRef(new Map<string, string>());
  const { isAuthenticated, user } = useAuthStore();

  const shouldSkipTracking = Boolean(
    isAuthenticated &&
      user?.username &&
      pageUsername &&
      user.username === pageUsername,
  );

  const getSessionKey = useCallback(
    (eventType: string) => {
      if (pageName === 'public-home') {
        return `analytics_${pageName}_${eventType}_${accountId}`;
      }
      return `analytics_${pageName}_${eventType}_${accountId}_${locationId || 'null'}_${recommendationId || 'null'}_${encodeURIComponent(canonicalPath)}`;
    },
    [accountId, canonicalPath, locationId, pageName, recommendationId],
  );

  const isEventTrackedInSession = useCallback(
    (eventType: string) => Boolean(sessionStorage.getItem(getSessionKey(eventType))),
    [getSessionKey],
  );

  const markEventAsTracked = useCallback(
    (eventType: string) => sessionStorage.setItem(getSessionKey(eventType), 'true'),
    [getSessionKey],
  );

  const trackEvent = useCallback(
    async (event: TrackableEvent): Promise<boolean> => {
      if (shouldSkipTracking || !hasAnalyticsConsent()) return false;
      if (!accountId) {
        setError('Account ID is required for tracking');
        return false;
      }

      const eventKey = `${pageName}_${canonicalPath}_${event.type}_${event.element || 'page'}`;
      const eventTypeToCheck =
        event.type === 'click' && event.element
          ? `click-${event.element}`
          : event.element?.includes('place-card')
            ? `${event.type}-${event.element}`
            : event.type;

      if (isEventTrackedInSession(eventTypeToCheck) || inFlight.current.has(eventKey)) {
        return false;
      }

      const now = Date.now();
      const lastCall = lastCallTime.current.get(eventKey);
      if (lastCall !== undefined && now - lastCall < 1000) return false;

      lastCallTime.current.set(eventKey, now);
      inFlight.current.add(eventKey);
      setLoading(true);
      setError(null);

      const utmParams = getSessionAttributionUtmParams();
      const referrerOrigin = getSessionAttributionReferrerOrigin();
      const metadata = privacySafeMetadata(event.metadata) as
        | Record<string, unknown>
        | undefined;
      const canUseCanonicalTargets = pagesWithCanonicalContentTargets.has(pageName);
      const dynamicLocationId = canUseCanonicalTargets
        ? (metadata?.listId as string | undefined) ||
          (metadata?.cityId as string | undefined) ||
          locationId
        : null;
      const dynamicRecommendationId = canUseCanonicalTargets
        ? (metadata?.recommendationId as string | undefined) ||
          (metadata?.placeId as string | undefined) ||
          (metadata?.id as string | undefined) ||
          recommendationId
        : null;
      const eventId =
        retryEventIds.current.get(eventKey) || createAnalyticsEventId();
      retryEventIds.current.set(eventKey, eventId);

      try {
        await postExplorersAnalyticsEvent({
          consent: true,
          eventId,
          accountId,
          locationId: dynamicLocationId ?? null,
          recommendationId: dynamicRecommendationId ?? null,
          event: {
            type: event.type,
            timestamp: new Date().toISOString(),
            page: pageName,
            ...(event.element ? { element: event.element } : {}),
            canonicalPath,
            ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
            ...(Object.keys(utmParams).length > 0 ? { utmParams } : {}),
            ...(referrerOrigin ? { referrerOrigin } : {}),
          },
        });
        retryEventIds.current.delete(eventKey);
        markEventAsTracked(eventTypeToCheck);
        return true;
      } catch (caught) {
        lastCallTime.current.delete(eventKey);
        setError(
          caught instanceof Error ? caught.message : 'Failed to track analytics event',
        );
        return false;
      } finally {
        inFlight.current.delete(eventKey);
        setLoading(inFlight.current.size > 0);
      }
    },
    [
      accountId,
      canonicalPath,
      isEventTrackedInSession,
      locationId,
      markEventAsTracked,
      pageName,
      recommendationId,
      shouldSkipTracking,
    ],
  );

  const trackView = useCallback(async () => {
    if (shouldSkipTracking || hasTrackedView || isEventTrackedInSession('view')) return;

    const metadata =
      pageName === 'public-home' && cityName ? { cityname: cityName } : undefined;
    const committed = await trackEvent({ type: 'view', metadata });
    if (committed && window.location.pathname === canonicalPath) {
      setHasTrackedView(true);
    }
  }, [canonicalPath, cityName, hasTrackedView, isEventTrackedInSession, pageName, shouldSkipTracking, trackEvent]);

  const trackClick = useCallback(
    (element: string, metadata?: Record<string, unknown>) => {
      if (shouldSkipTracking) return;

      let clickIdentifier = element;
      if (metadata?.platform) clickIdentifier = `${element}-${metadata.platform}`;
      else if (metadata?.index !== undefined) clickIdentifier = `${element}-${metadata.index}`;
      else if (metadata?.cityId) clickIdentifier = `${element}-${metadata.cityId}`;
      else if (metadata?.id) clickIdentifier = `${element}-${metadata.id}`;

      if (isEventTrackedInSession(`click-${clickIdentifier}`)) return;
      void trackEvent({
        type: 'click',
        element: clickIdentifier,
        metadata: { ...metadata, originalElement: element },
      });
    },
    [isEventTrackedInSession, shouldSkipTracking, trackEvent],
  );

  const trackInteraction = useCallback(
    (element: string, metadata?: Record<string, unknown>) => {
      if (shouldSkipTracking || isEventTrackedInSession('interaction')) return;
      void trackEvent({ type: 'interaction', element, metadata });
    },
    [isEventTrackedInSession, shouldSkipTracking, trackEvent],
  );

  useEffect(() => {
    setHasTrackedView(false);
  }, [accountId, canonicalPath, locationId, pageName, recommendationId]);

  useEffect(() => {
    const refreshConsent = () => setHasConsent(hasAnalyticsConsent());
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, refreshConsent);
    return () =>
      window.removeEventListener(
        ANALYTICS_CONSENT_CHANGED_EVENT,
        refreshConsent,
      );
  }, []);

  useEffect(() => {
    if (
      autoTrackView &&
      hasConsent &&
      accountId &&
      !hasTrackedView &&
      !shouldSkipTracking &&
      (!waitForLocation || locationId)
    ) {
      void trackView();
    }
  }, [
    accountId,
    autoTrackView,
    hasConsent,
    hasTrackedView,
    locationId,
    shouldSkipTracking,
    trackView,
    waitForLocation,
  ]);

  return { trackEvent, trackView, trackClick, trackInteraction, loading, error };
};

export const getAccountIdFromUsername = async (
  username: string,
): Promise<string | null> => username;

export const createAnalyticsOptions = {
  profile: (
    accountDocumentId: string,
    pageUsername?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    pageName: 'public-profile',
    pageUsername,
    autoTrackView: true,
  }),

  home: (
    accountDocumentId: string,
    pageUsername?: string,
    locationDocumentId?: string,
    recommendationDocumentId?: string,
    cityName?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    locationId: locationDocumentId || null,
    recommendationId: recommendationDocumentId || null,
    pageName: 'public-home',
    pageUsername,
    autoTrackView: true,
    cityName,
  }),

  recommendation: (
    accountDocumentId: string,
    pageUsername?: string,
    locationDocumentId?: string,
    recommendationDocumentId?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    locationId: locationDocumentId || null,
    recommendationId: recommendationDocumentId || null,
    pageName: 'recommendation-detail',
    pageUsername,
    autoTrackView: true,
  }),

  music: (
    accountDocumentId: string,
    pageUsername?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    pageName: 'public-music',
    pageUsername,
    autoTrackView: true,
  }),

  movies: (
    accountDocumentId: string,
    pageUsername?: string,
    listDocumentId?: string,
    movieDocumentId?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    locationId: listDocumentId || null,
    recommendationId: movieDocumentId || null,
    pageName: 'public-movies',
    pageUsername,
    autoTrackView: true,
  }),

  books: (
    accountDocumentId: string,
    pageUsername?: string,
    listDocumentId?: string,
    bookDocumentId?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    locationId: listDocumentId || null,
    recommendationId: bookDocumentId || null,
    pageName: 'public-books',
    pageUsername,
    autoTrackView: true,
  }),

  games: (
    accountDocumentId: string,
    pageUsername?: string,
    listDocumentId?: string,
    gameDocumentId?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    locationId: listDocumentId || null,
    recommendationId: gameDocumentId || null,
    pageName: 'public-games',
    pageUsername,
    autoTrackView: true,
  }),

  apps: (
    accountDocumentId: string,
    pageUsername?: string,
    listDocumentId?: string,
    appDocumentId?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    locationId: listDocumentId || null,
    recommendationId: appDocumentId || null,
    pageName: 'public-apps',
    pageUsername,
    autoTrackView: true,
  }),

  products: (
    accountDocumentId: string,
    pageUsername?: string,
    listDocumentId?: string,
    productDocumentId?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    locationId: listDocumentId || null,
    recommendationId: productDocumentId || null,
    pageName: 'public-products',
    pageUsername,
    autoTrackView: true,
  }),

  people: (
    accountDocumentId: string,
    pageUsername?: string,
    listDocumentId?: string,
    personDocumentId?: string,
  ): UseTrackAnalyticsOptions => ({
    accountId: accountDocumentId,
    locationId: listDocumentId || null,
    recommendationId: personDocumentId || null,
    pageName: 'public-people',
    pageUsername,
    autoTrackView: true,
  }),
};

export default useTrackAnalytics;
