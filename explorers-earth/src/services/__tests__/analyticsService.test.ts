import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useAuthStore from '../../store/store';
import * as analyticsClient from '../explorersAnalyticsClient';
import useTrackAnalytics, {
  createAnalyticsOptions,
  getAccountIdFromUsername,
} from '../analyticsService';

vi.mock('../explorersAnalyticsClient', () => ({
  ANALYTICS_CONSENT_CHANGED_EVENT: 'explorers:analytics-consent-changed',
  createAnalyticsEventId: vi.fn(() => 'event-fixed-123'),
  hasAnalyticsConsent: vi.fn(() => true),
  postExplorersAnalyticsEvent: vi.fn(() => Promise.resolve()),
}));

describe('analyticsService', () => {
  const postEvent = vi.mocked(analyticsClient.postExplorersAnalyticsEvent);
  const hasConsent = vi.mocked(analyticsClient.hasAnalyticsConsent);
  const createEventId = vi.mocked(analyticsClient.createAnalyticsEventId);

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-24T10:00:00.000Z'));
    vi.clearAllMocks();
    hasConsent.mockReturnValue(true);
    postEvent.mockResolvedValue(undefined);
    createEventId.mockReturnValue('event-fixed-123');
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(
      {},
      '',
      '/tk2727?utm_source=twitter&utm_medium=social&utm_campaign=launch&utm_term=travel&utm_content=hero',
    );
    useAuthStore.setState({ isAuthenticated: false, user: null, token: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getAccountIdFromUsername', () => {
    it('returns the username as account ID', async () => {
      await expect(getAccountIdFromUsername('testuser')).resolves.toBe('testuser');
    });
  });

  describe('createAnalyticsOptions', () => {
    it('creates profile options correctly', () => {
      expect(createAnalyticsOptions.profile('doc123', 'john')).toEqual({
        accountId: 'doc123',
        pageName: 'public-profile',
        pageUsername: 'john',
        autoTrackView: true,
      });
    });

    it('creates home options correctly', () => {
      expect(createAnalyticsOptions.home('doc123', 'john', 'loc123', 'rec123', 'Paris')).toEqual({
        accountId: 'doc123',
        locationId: 'loc123',
        recommendationId: 'rec123',
        pageName: 'public-home',
        pageUsername: 'john',
        autoTrackView: true,
        cityName: 'Paris',
      });
    });

    it('creates media options with list and recommendation IDs', () => {
      const options = createAnalyticsOptions.movies('doc123', 'john', 'list1', 'movie1');
      expect(options).toMatchObject({
        pageName: 'public-movies',
        locationId: 'list1',
        recommendationId: 'movie1',
      });
    });

    it('creates analytics options for apps, products, and people', () => {
      expect(createAnalyticsOptions.apps('doc123', 'john')).toMatchObject({
        pageName: 'public-apps',
        accountId: 'doc123',
      });
      expect(createAnalyticsOptions.products('doc123', 'john')).toMatchObject({
        pageName: 'public-products',
        accountId: 'doc123',
      });
      expect(createAnalyticsOptions.people('doc123', 'john')).toMatchObject({
        pageName: 'public-people',
        accountId: 'doc123',
      });
    });
  });

  describe('useTrackAnalytics', () => {
    it('auto-tracks a consented view through Local Tunes', async () => {
      renderHook(() =>
        useTrackAnalytics({
          accountId: 'acc1',
          pageName: 'public-profile',
          autoTrackView: true,
        }),
      );

      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(1));
      expect(postEvent.mock.calls[0][0]).toMatchObject({
        consent: true,
        eventId: 'event-fixed-123',
        accountId: 'acc1',
        event: {
          type: 'view',
          page: 'public-profile',
          canonicalPath: '/tk2727',
        },
      });
    });

    it('does not make any analytics request without explicit consent', async () => {
      hasConsent.mockReturnValue(false);

      const { result } = renderHook(() =>
        useTrackAnalytics({
          accountId: 'acc1',
          pageName: 'public-profile',
          autoTrackView: true,
        }),
      );

      await act(async () => result.current.trackClick('profile-link'));
      expect(postEvent).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
    });

    it('auto-tracks exactly once when a direct visitor grants analytics consent', async () => {
      hasConsent.mockReturnValue(false);

      renderHook(() =>
        useTrackAnalytics({
          accountId: 'acc1',
          pageName: 'public-profile',
          autoTrackView: true,
        }),
      );

      await act(async () => Promise.resolve());
      expect(postEvent).not.toHaveBeenCalled();

      hasConsent.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(
          new Event('explorers:analytics-consent-changed'),
        );
      });

      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(1));
      act(() => {
        window.dispatchEvent(
          new Event('explorers:analytics-consent-changed'),
        );
      });
      await act(async () => Promise.resolve());
      expect(postEvent).toHaveBeenCalledTimes(1);
    });

    it('tracks distinct public routes independently within one browser session', async () => {
      window.history.replaceState({}, '', '/tk2727/people');
      const first = renderHook(() =>
        useTrackAnalytics({
          accountId: 'acc1',
          pageName: 'public-people',
          autoTrackView: true,
        }),
      );
      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(1));

      window.history.replaceState({}, '', '/tk2727/people/sector/builders');
      first.rerender();

      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(2));
      expect(postEvent.mock.calls.map(([body]) => body.event.canonicalPath)).toEqual([
        '/tk2727/people',
        '/tk2727/people/sector/builders',
      ]);
    });

    it('does not let an in-flight source route suppress a same-component destination view', async () => {
      let resolveSource!: () => void;
      postEvent
        .mockImplementationOnce(
          () => new Promise<void>((resolve) => {
            resolveSource = resolve;
          }),
        )
        .mockResolvedValueOnce(undefined);

      window.history.replaceState({}, '', '/tk2727/people/sector/builders');
      const hook = renderHook(() =>
        useTrackAnalytics({
          accountId: 'acc1',
          pageName: 'public-people',
          autoTrackView: true,
        }),
      );
      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(1));

      window.history.replaceState({}, '', '/tk2727/people/sector/designers');
      hook.rerender();
      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(2));

      expect(postEvent.mock.calls.map(([body]) => body.event.canonicalPath)).toEqual([
        '/tk2727/people/sector/builders',
        '/tk2727/people/sector/designers',
      ]);
      await act(async () => resolveSource());
    });

    it('keeps a failed automatic view retryable until the write commits', async () => {
      createEventId
        .mockReturnValueOnce('event-original-123')
        .mockReturnValueOnce('event-should-not-be-used');
      postEvent.mockRejectedValueOnce(new Error('Local Tunes unavailable'));
      const { result } = renderHook(() =>
        useTrackAnalytics({
          accountId: 'acc1',
          pageName: 'public-profile',
          autoTrackView: true,
        }),
      );

      await waitFor(() =>
        expect(result.current.error).toBe('Local Tunes unavailable'),
      );
      expect(postEvent).toHaveBeenCalledTimes(1);

      postEvent.mockResolvedValueOnce(undefined);
      await act(async () => result.current.trackView());

      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(2));
      expect(postEvent.mock.calls.map(([body]) => body.eventId)).toEqual([
        'event-original-123',
        'event-original-123',
      ]);
      expect(createEventId).toHaveBeenCalledTimes(1);
      expect(
        sessionStorage.getItem(
          'analytics_public-profile_view_acc1_null_null_%2Ftk2727',
        ),
      ).toBe('true');
    });

    it('skips tracking when an authenticated user visits their own page', async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        token: 'private-token',
        user: {
          id: '1',
          documentId: 'acc1',
          username: 'john',
          email: 'john@example.com',
          blocked: false,
        },
      });

      renderHook(() =>
        useTrackAnalytics({
          accountId: 'acc1',
          pageName: 'public-profile',
          pageUsername: 'john',
          autoTrackView: true,
        }),
      );

      await Promise.resolve();
      expect(postEvent).not.toHaveBeenCalled();
    });

    it('deduplicates rapid clicks on the same element', async () => {
      const { result } = renderHook(() =>
        useTrackAnalytics({ accountId: 'acc1', pageName: 'custom-page', autoTrackView: false }),
      );

      await act(async () => {
        result.current.trackClick('button-1');
        result.current.trackClick('button-1');
      });

      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(1));
    });

    it('tracks different recommendation cards independently', async () => {
      const { result } = renderHook(() =>
        useTrackAnalytics({ accountId: 'acc1', pageName: 'public-home', autoTrackView: false }),
      );

      await act(async () => {
        result.current.trackClick('place-card-1', { placeId: 'place-1' });
        result.current.trackClick('place-card-2', { placeId: 'place-2' });
      });

      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(2));
      expect(postEvent.mock.calls.map(([body]) => body.recommendationId)).toEqual([
        'place-1',
        'place-2',
      ]);
    });

    it('maps every category card ID and list ID into canonical analytics fields', async () => {
      const { result } = renderHook(() =>
        useTrackAnalytics({ accountId: 'acc1', pageName: 'public-books', autoTrackView: false }),
      );

      await act(async () => {
        result.current.trackClick('book-card', {
          id: 'book-1',
          listId: 'reading-list-1',
          title: 'Clean Code',
        });
      });

      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(1));
      expect(postEvent.mock.calls[0][0]).toMatchObject({
        locationId: 'reading-list-1',
        recommendationId: 'book-1',
      });
    });

    it('keeps non-Strapi profile feed IDs out of canonical target fields', async () => {
      const { result } = renderHook(() =>
        useTrackAnalytics({ accountId: 'acc1', pageName: 'public-profile', autoTrackView: false }),
      );

      await act(async () => {
        result.current.trackClick('feed-item', {
          id: 'feed-json-entry-1',
          title: 'A photo from the feed',
        });
      });

      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(1));
      expect(postEvent.mock.calls[0][0]).toMatchObject({
        locationId: null,
        recommendationId: null,
      });
      expect(postEvent.mock.calls[0][0].event.metadata).toMatchObject({
        id: 'feed-json-entry-1',
      });
    });

    it('sends all five UTM fields but never a raw IP or full query URL', async () => {
      const { result } = renderHook(() =>
        useTrackAnalytics({ accountId: 'acc1', pageName: 'public-profile', autoTrackView: false }),
      );

      await act(async () => result.current.trackView());
      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(1));

      const body = postEvent.mock.calls[0][0];
      expect(body.event.utmParams).toEqual({
        utm_source: 'twitter',
        utm_medium: 'social',
        utm_campaign: 'launch',
        utm_term: 'travel',
        utm_content: 'hero',
      });
      expect(body.event.canonicalPath).toBe('/tk2727');
      expect(JSON.stringify(body)).not.toContain('ipAddress');
      expect(JSON.stringify(body)).not.toContain('192.168');
      expect(JSON.stringify(body)).not.toContain('?utm_');
    });

    it('sends only bounded allowlisted metadata and drops PII, tokens, URLs, and unknown keys', async () => {
      const { result } = renderHook(() =>
        useTrackAnalytics({ accountId: 'acc1', pageName: 'public-profile', autoTrackView: false }),
      );

      await act(async () =>
        result.current.trackClick('share-button', {
          context: 'profile-header',
          token: 'private-token',
          authorization: 'Bearer secret',
          email: 'visitor@example.com',
          url: 'https://explorers.earth/tk2727?secret=yes',
          unknownFutureKey: 'not-yet-approved',
        }),
      );
      await waitFor(() => expect(postEvent).toHaveBeenCalledTimes(1));

      expect(postEvent.mock.calls[0][0].event.metadata).toEqual({
        context: 'profile-header',
        originalElement: 'share-button',
      });
    });

    it('exposes a write failure and does not mark the event as sent', async () => {
      postEvent.mockRejectedValueOnce(new Error('Local Tunes unavailable'));
      const { result } = renderHook(() =>
        useTrackAnalytics({ accountId: 'acc1', pageName: 'custom-page', autoTrackView: false }),
      );

      await act(async () => result.current.trackInteraction('scroll'));

      await waitFor(() => expect(result.current.error).toBe('Local Tunes unavailable'));
      expect(
        sessionStorage.getItem(
          'analytics_custom-page_interaction_acc1_null_null_%2Ftk2727',
        ),
      ).toBeNull();
    });
  });
});
