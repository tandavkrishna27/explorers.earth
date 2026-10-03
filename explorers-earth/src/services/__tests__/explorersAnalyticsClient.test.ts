import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
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

type LegacyAnalyticsReadScope = {
  accountId: string;
  from: string;
  to: string;
  token: string;
};

describe('explorersAnalyticsClient', () => {
  it.each([new Response(null,{status:204}),new Response('{}',{status:200}),new Response('{"status":"committed"}',{status:201}),new Response('html',{status:200})])('does not acknowledge an invalid success envelope',async(response)=>{
    await expect(postExplorersAnalyticsEvent(payload,{fetchImpl:vi.fn(async()=>response),retryCount:0})).rejects.toThrow('receipt');
  });
  it('accepts a retired committed duplicate without a document ID',async()=>{
    await expect(postExplorersAnalyticsEvent(payload,{fetchImpl:vi.fn(async()=>new Response('{"status":"committed","duplicate":true,"retired":true}',{status:200})),retryCount:0})).resolves.toBeUndefined();
  });
  it('stops a transient retry if consent is withdrawn by the first request',async()=>{
    const fetchImpl=vi.fn(async()=>{localStorage.clear();throw new TypeError('lost acknowledgement');});
    await expect(postExplorersAnalyticsEvent(payload,{fetchImpl})).rejects.toThrow('consent');expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('never submits without current browser consent and stops pending polls after withdrawal',async()=>{
    localStorage.clear();const fetchImpl=vi.fn().mockResolvedValue(new Response(null,{status:202}));
    await expect(postExplorersAnalyticsEvent(payload,{fetchImpl})).rejects.toThrow('consent');expect(fetchImpl).not.toHaveBeenCalled();
    localStorage.setItem('explorers-cookie-consent',JSON.stringify({analytics:true}));
    await expect(postExplorersAnalyticsEvent(payload,{fetchImpl,sleep:async()=>{localStorage.clear();}})).rejects.toThrow('consent');expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('explorers-cookie-consent',JSON.stringify({analytics:true}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('enables analytics only after an explicit analytics consent', () => {
    localStorage.clear();
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
      referrerPolicy: 'no-referrer',
    });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(init.body).not.toContain('ipAddress');
    expect(init.body).not.toContain('rawIp');
  });

  it('routes canonical POST directly to the same-origin API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'committed', duplicate: false }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchImpl);

    await postExplorersAnalyticsEvent(payload, { retryCount: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/explorers/analytics/events');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      referrerPolicy: 'no-referrer',
      body: JSON.stringify(payload),
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps an explicitly injected HTTPS transport direct', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'committed', duplicate: false }), { status: 201 }),
    );

    await postExplorersAnalyticsEvent(payload, {
      baseUrl: 'https://analytics.example.test',
      fetchImpl,
      retryCount: 0,
    });

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://analytics.example.test/api/explorers/analytics/events',
    );
  });

  it('keeps canonical production POST same-origin despite a historical Music origin', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_LOCAL_TUNES_API_URL', 'https://analytics-production.example');
    vi.resetModules();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'committed', duplicate: false }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchImpl);
    const { postExplorersAnalyticsEvent: postWithProductionDefaults } =
      await import('../explorersAnalyticsClient');

    await postWithProductionDefaults(payload, { retryCount: 0 });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/explorers/analytics/events',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        referrerPolicy: 'no-referrer',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('keeps an omitted production GET fetch on the configured HTTPS origin', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_LOCAL_TUNES_API_URL', 'https://analytics-production.example');
    vi.resetModules();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchImpl);
    const { readExplorersAnalyticsEvents: readWithProductionDefaults } =
      await import('../explorersAnalyticsClient');

    await readWithProductionDefaults({
      accountId: 'production-account',
      fromDate: '2026-08-01',
      toDate: '2026-08-24',
      timeZone: 'Europe/London',
      token: 'synthetic-production-token',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://analytics-production.example/api/explorers/analytics/events?accountId=production-account&fromDate=2026-08-01&toDate=2026-08-24&timeZone=Europe%2FLondon',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer synthetic-production-token' },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('rejects a non-committed injected response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchImpl);

    await expect(
      postExplorersAnalyticsEvent(payload, {
        baseUrl: 'https://unexpected.example.test',
        retryCount: 0,
      }),
     ).rejects.toThrow('receipt');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure once with the identical event ID', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'committed', duplicate: false }), { status: 201 }));

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

  it('reads only an authenticated account with date-only values and an IANA timezone', async () => {
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
        fromDate: '2026-08-01',
        toDate: '2026-08-24',
        timeZone: 'America/New_York',
        token: 'private-user-token',
      },
      { baseUrl: 'http://localhost:5000/', fetchImpl },
    );

    expect(result).toEqual(records);
    const [url, init] = fetchImpl.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/explorers/analytics/events');
    expect(parsed.searchParams.get('accountId')).toBe('account-1');
    expect(parsed.searchParams.get('fromDate')).toBe('2026-08-01');
    expect(parsed.searchParams.get('toDate')).toBe('2026-08-24');
    expect(parsed.searchParams.get('timeZone')).toBe('America/New_York');
    expect(init.headers).toEqual({ Authorization: 'Bearer private-user-token' });
    expect(url).not.toContain('private-user-token');
  });

  it.runIf(import.meta.env.DEV)('routes the default development GET through the proxy with its query and authorization intact', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchImpl);

    await readExplorersAnalyticsEvents({
      accountId: 'account-query-value',
      fromDate: '2026-08-01',
      toDate: '2026-08-24',
      timeZone: 'America/New_York',
      token: 'synthetic-dashboard-token',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [rawUrl, init] = fetchImpl.mock.calls[0];
    const url = new URL(rawUrl, window.location.origin);
    expect(url.pathname).toBe('/__localtunes/api/explorers/analytics/events');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      accountId: 'account-query-value',
      fromDate: '2026-08-01',
      toDate: '2026-08-24',
      timeZone: 'America/New_York',
    });
    expect(init).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer synthetic-dashboard-token' },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(rawUrl).not.toContain('synthetic-dashboard-token');
  });

  it('rejects dashboard reads without a user token before any request', async () => {
    const fetchImpl = vi.fn();
    await expect(
      readExplorersAnalyticsEvents(
        {
          accountId: 'account-1',
          fromDate: '2026-08-01',
          toDate: '2026-08-24',
          timeZone: 'America/New_York',
          token: '',
        },
        { baseUrl: 'http://localhost:5000', fetchImpl },
      ),
    ).rejects.toThrow('authentication');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['null', 'false', '1', '"true"', '{"analytics":"false"}', '{"analytics":"true"}', '{"analytics":1}'])('rejects non-boolean opt-in: %s', (stored) => {
    expect(hasAnalyticsConsent({ getItem: () => stored })).toBe(false);
  });

  it('fails closed for a denied injected storage reader', () => {
    expect(hasAnalyticsConsent({ getItem() { throw new Error('denied'); } })).toBe(false);
  });

  it('fails closed when resolving the default localStorage property throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('property denied'); } });
    try {
      expect(() => hasAnalyticsConsent()).not.toThrow();
      expect(hasAnalyticsConsent()).toBe(false);
      // Injected readers remain usable without touching unavailable defaults.
      expect(hasAnalyticsConsent({ getItem: () => '{"analytics":true}' })).toBe(true);
    } finally {
      Object.defineProperty(window, 'localStorage', descriptor);
    }
  });

  it('rejects legacy instant read scopes before a request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), { status: 200 }),
    );

    const legacyScope: LegacyAnalyticsReadScope = {
      accountId: 'account-1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-24T23:59:59.999Z',
      token: 'private-user-token',
    };

    await expect(
      readExplorersAnalyticsEvents(
        legacyScope as never,
        { baseUrl: 'http://localhost:5000', fetchImpl },
      ),
    ).rejects.toThrow('date-only');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('excludes legacy instants from the public read scope type', () => {
    expectTypeOf<LegacyAnalyticsReadScope>().not.toMatchTypeOf<
      Parameters<typeof readExplorersAnalyticsEvents>[0]
    >();
  });
});
