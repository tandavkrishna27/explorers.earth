import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAnalyticsEventId,
  hasAnalyticsConsent,
  postExplorersAnalyticsEvent,
  readExplorersAnalyticsEvents,
  type ExplorersAnalyticsWritePayload,
} from '../explorersAnalyticsClient';

const payload: ExplorersAnalyticsWritePayload = {
  consent: true,
  eventId: 'event-fixed-123',
  accountId: 'account-1',
  locationId: null,
  recommendationId: null,
  event: {
    type: 'view',
    timestamp: '2026-08-24T10:00:00.000Z',
    page: 'public-profile',
    canonicalPath: '/tk2727',
    utmParams: {
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'summer',
      utm_term: 'travel',
      utm_content: 'hero',
    },
  },
};

describe('explorersAnalyticsClient', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('enables analytics only after an explicit analytics consent', () => {
    expect(hasAnalyticsConsent()).toBe(false);

    localStorage.setItem('explorers-cookie-consent', '{bad json');
    expect(hasAnalyticsConsent()).toBe(false);

    localStorage.setItem(
      'explorers-cookie-consent',
      JSON.stringify({ necessary: true, analytics: false }),
    );
    expect(hasAnalyticsConsent()).toBe(false);

    localStorage.setItem(
      'explorers-cookie-consent',
      JSON.stringify({ necessary: true, analytics: true }),
    );
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('creates opaque event IDs without using account or path data', () => {
    const id = createAnalyticsEventId(() => 'uuid-from-crypto');
    expect(id).toBe('uuid-from-crypto');
    expect(id).not.toContain(payload.accountId);
    expect(id).not.toContain(payload.event.canonicalPath);
  });

  it('posts a consented event to Local Tunes without an auth token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'committed', duplicate: false }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await postExplorersAnalyticsEvent(payload, {
      baseUrl: 'http://localhost:5000/',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:5000/api/explorers/analytics/events');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(init.body).not.toContain('ipAddress');
    expect(init.body).not.toContain('rawIp');
  });

  it('retries a transient failure once with the identical event ID', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'committed' }), { status: 201 }));

    await postExplorersAnalyticsEvent(payload, {
      baseUrl: 'http://localhost:5000',
      fetchImpl,
      retryCount: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    const secondBody = JSON.parse(fetchImpl.mock.calls[1][1].body as string);
    expect(firstBody.eventId).toBe('event-fixed-123');
    expect(secondBody.eventId).toBe(firstBody.eventId);
    expect(secondBody).toEqual(firstBody);
  });

  it('does not treat a still-pending idempotency receipt as a committed event', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'pending', duplicate: true }), {
          status: 202,
        }),
      );

    await expect(
      postExplorersAnalyticsEvent(payload, {
        baseUrl: 'http://localhost:5000',
        fetchImpl,
        retryCount: 0,
        pendingPollCount: 2,
        pendingPollBaseDelayMs: 10,
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('202');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body as string));
    expect(new Set(bodies.map((body) => body.eventId))).toEqual(
      new Set(['event-fixed-123']),
    );
  });

  it('polls a pending receipt with backoff and the identical event ID until it commits', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'pending', duplicate: true }), {
          status: 202,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'committed', duplicate: true }), {
          status: 200,
        }),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);

    await postExplorersAnalyticsEvent(payload, {
      baseUrl: 'http://localhost:5000',
      fetchImpl,
      retryCount: 0,
      pendingPollCount: 3,
      pendingPollBaseDelayMs: 25,
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(25);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].body).toBe(fetchImpl.mock.calls[0][1].body);
  });

  it('keeps polling the same receipt beyond the backend eight-second publish window', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'committed', duplicate: true }), {
          status: 200,
        }),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);

    await postExplorersAnalyticsEvent(payload, {
      baseUrl: 'http://localhost:5000',
      fetchImpl,
      retryCount: 0,
      sleep,
    });

    const delays = sleep.mock.calls.map(([delay]) => delay as number);
    expect(delays.reduce((total, delay) => total + delay, 0)).toBeGreaterThan(
      8_000,
    );
    expect(Math.max(...delays)).toBeLessThanOrEqual(2_000);
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    const bodies = fetchImpl.mock.calls.map(([, init]) => init.body);
    expect(new Set(bodies)).toHaveLength(1);
  });

  it('does not retry validation or authorization failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('invalid', { status: 400 }));

    await expect(
      postExplorersAnalyticsEvent(payload, {
        baseUrl: 'http://localhost:5000',
        fetchImpl,
        retryCount: 2,
      }),
    ).rejects.toThrow('400');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reads only an authenticated account and server-side date range', async () => {
    const records = [{ Account_Id: 'account-1', Stats: [] }];
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: records }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await readExplorersAnalyticsEvents(
      {
        accountId: 'account-1',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-24T23:59:59.999Z',
        token: 'private-user-token',
      },
      { baseUrl: 'http://localhost:5000/', fetchImpl },
    );

    expect(result).toEqual(records);
    const [url, init] = fetchImpl.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/explorers/analytics/events');
    expect(parsed.searchParams.get('accountId')).toBe('account-1');
    expect(parsed.searchParams.get('from')).toBe('2026-08-01T00:00:00.000Z');
    expect(parsed.searchParams.get('to')).toBe('2026-08-24T23:59:59.999Z');
    expect(init.headers).toEqual({ Authorization: 'Bearer private-user-token' });
    expect(url).not.toContain('private-user-token');
  });

  it('rejects dashboard reads without a user token before any request', async () => {
    const fetchImpl = vi.fn();
    await expect(
      readExplorersAnalyticsEvents(
        {
          accountId: 'account-1',
          from: '2026-08-01T00:00:00.000Z',
          to: '2026-08-24T23:59:59.999Z',
          token: '',
        },
        { baseUrl: 'http://localhost:5000', fetchImpl },
      ),
    ).rejects.toThrow('authentication');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
