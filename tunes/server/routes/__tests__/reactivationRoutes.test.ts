import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { createLoopbackSupertestScope } from '../../test/helpers/loopback-supertest';

vi.mock("dotenv", () => {
  throw new Error("DEFAULT_TEST_DOTENV_IMPORT_FORBIDDEN");
});

const databaseBoundary = vi.hoisted(() => {
  const unexpected: string[] = [];
  const reject = (operation: string) => (..._args: unknown[]): never => {
    unexpected.push(operation);
    throw new Error(`Unexpected database use: ${operation}`);
  };
  return {
    unexpected,
    pool: {
      query: reject("pool.query"),
      connect: reject("pool.connect"),
      end: reject("pool.end"),
    },
  };
});

vi.mock("../../db", () => ({ pool: databaseBoundary.pool }));

// Mock the service so the route never touches Strapi / Postgres.
vi.mock('../../services/reactivation-service', () => ({
  requestReactivation: vi.fn().mockResolvedValue(undefined),
  confirmReactivation: vi.fn().mockResolvedValue({ success: true }),
}));

import {
  setupReactivationRoutes,
  reactivationRateLimitKey,
  reactivationRateLimitSkip,
  isValidReactivationEmail,
  reactivationGlobalLimiter,
  REACTIVATION_GLOBAL_MAX,
  reactivationAddressLimiter,
  reactivationAddressLimitKey,
  REACTIVATION_ADDRESS_MAX,
} from '../reactivationRoutes';
import { confirmReactivation } from '../../services/reactivation-service';

const REQ = '/api/user/request-reactivation';
const loopback = createLoopbackSupertestScope();

function buildApp() {
  const app = express();
  app.use(express.json());
  app.set('trust proxy', true); // replicate production so the X-Forwarded-For spoof test is meaningful
  setupReactivationRoutes(app);
  return app;
}

it('passes the production Music reactivation transition into token confirmation', async () => {
  // Break caught: Strapi is unblocked but the durable Music owner remains suspended.
  const reactivateMusic = vi.fn(async () => undefined);
  const app = express();
  app.use(express.json());
  setupReactivationRoutes(app, { reactivateMusic });

  const { request } = await loopback.open({ app });
  await request.get('/api/user/reactivate?token=valid-token').expect(200);
  expect(confirmReactivation).toHaveBeenCalledWith('valid-token', expect.objectContaining({ reactivateMusic }));
});

beforeEach(() => {
  // The global limiter uses a constant key shared across the whole module, so
  // reset it between tests (per-email tests already use distinct emails).
  reactivationGlobalLimiter.resetKey('reactivation:global');
  for (const address of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
    reactivationAddressLimiter.resetKey(`reactivation-address:${address}`);
  }
});

afterEach(async () => {
  try {
    expect(databaseBoundary.unexpected).toEqual([]);
  } finally {
    await loopback.closeAll();
  }
});

describe('reactivation route harness smoke test', () => {
  it('returns 200 for a valid reactivation request', async () => {
    const app = buildApp();
    const session = await loopback.open({ app });
    const res = await session.request.post(REQ).send({ email: 'smoke@example.com' });
    expect(res.status).toBe(200);
    expect(session.server.address()).toMatchObject({ address: '127.0.0.1', family: 'IPv4' });
  });
});

describe('POST /api/user/request-reactivation rate limiting', () => {
  it('allows 5 requests for an email then 429s the 6th', async () => {
    const app = buildApp();
    const { request } = await loopback.open({ app });
    const email = 'cap-test@example.com';
    for (let i = 1; i <= 5; i++) {
      const res = await request.post(REQ).send({ email });
      expect(res.status).toBe(200);
    }
    const sixth = await request.post(REQ).send({ email });
    expect(sixth.status).toBe(429);
    expect(sixth.body.message).toMatch(/too many/i);
  });

  it('cannot be bypassed by rotating X-Forwarded-For (per-email cap holds)', async () => {
    const app = buildApp();
    const { request } = await loopback.open({ app });
    const email = 'spoof-test@example.com';
    for (let i = 1; i <= 5; i++) {
      const res = await request.post(REQ).set('X-Forwarded-For', `10.0.0.${i}`).send({ email });
      expect(res.status).toBe(200);
    }
    const sixth = await request.post(REQ).set('X-Forwarded-For', '10.0.0.99').send({ email });
    expect(sixth.status).toBe(429); // spoofed IP must NOT reset the per-email bucket
  });

  it('keeps separate buckets per email', async () => {
    const app = buildApp();
    const { request } = await loopback.open({ app });
    const a = 'indep-a@example.com';
    const b = 'indep-b@example.com';
    for (let i = 1; i <= 6; i++) await request.post(REQ).send({ email: a });
    const aLimited = await request.post(REQ).send({ email: a });
    expect(aLimited.status).toBe(429);
    const bFirst = await request.post(REQ).send({ email: b });
    expect(bFirst.status).toBe(200); // a different email is unaffected
  });

  it('does not rate-limit requests with no email — stays 400 even when spammed', async () => {
    const app = buildApp();
    const { request } = await loopback.open({ app });
    let last = 0;
    for (let i = 1; i <= 7; i++) {
      const res = await request.post(REQ).send({});
      last = res.status;
    }
    expect(last).toBe(400); // skipped by limiter → hits route validation, never 429
  });
});

describe('reactivationRateLimitKey', () => {
  it('keys on the normalized (trimmed, lowercased) email', () => {
    expect(reactivationRateLimitKey({ body: { email: '  Foo@Bar.COM ' } } as any)).toBe('reactivation:foo@bar.com');
  });
  it('produces a stable empty key when email is missing', () => {
    expect(reactivationRateLimitKey({ body: {} } as any)).toBe('reactivation:');
  });
});

describe('reactivation address and global abuse limits', () => {
  it('keys the recovery limiter by normalized client address', () => {
    expect(reactivationAddressLimitKey({ ip: '203.0.113.7' } as any)).toBe('reactivation-address:203.0.113.7');
    expect(reactivationAddressLimitKey({ ip: undefined } as any)).toBe('reactivation-address:unknown');
  });

  it('allows more than the former 30/hour global bucket while bounding one address', async () => {
    const app = buildApp();
    const { request } = await loopback.open({ app });
    for (let i = 0; i < REACTIVATION_ADDRESS_MAX; i++) {
      const res = await request.post(REQ).set('X-Forwarded-For', '203.0.113.9').send({ email: `address-${i}@example.com` });
      expect(res.status).toBe(200);
    }
    const limited = await request.post(REQ).set('X-Forwarded-For', '203.0.113.9').send({ email: 'address-overflow@example.com' });
    expect(limited.status).toBe(429);

    for (let i = 0; i < 31; i++) {
      const res = await request.post(REQ).set('X-Forwarded-For', `198.51.100.${i + 1}`).send({ email: `legitimate-${i}@example.com` });
      expect(res.status).toBe(200);
    }
  });

  it('does not charge address-denied requests to the global recovery budget', async () => {
    // Break caught: global middleware ran first, so already-denied requests from
    // one address could exhaust recovery for every legitimate address.
    const app = buildApp();
    const { request } = await loopback.open({ app });
    for (let i = 0; i <= REACTIVATION_GLOBAL_MAX; i++) {
      await request.post(REQ).set('X-Forwarded-For', '203.0.113.201').send({ email: `denied-${i}@example.com` });
    }
    const legitimate = await request.post(REQ).set('X-Forwarded-For', '198.51.100.201').send({ email: 'legitimate-after-denial@example.com' });
    expect(legitimate.status).toBe(200);
  });

  it('bounds arbitrary public confirmation tokens by source before database work', async () => {
    // Break caught: GET confirmation had no admission control, so every random
    // token reached the durable PostgreSQL claim query.
    const app = buildApp();
    const { request } = await loopback.open({ app });
    const source = '203.0.113.202';
    for (let i = 0; i < REACTIVATION_ADDRESS_MAX; i++) {
      const response = await request.get(`/api/user/reactivate?token=${i.toString(16).padStart(64, '0')}`).set('X-Forwarded-For', source);
      expect(response.status).toBe(503);
    }
    const overflow = await request.get(`/api/user/reactivate?token=${'f'.repeat(64)}`).set('X-Forwarded-For', source);
    expect(overflow.status).toBe(429);
  });

  it('does not let uppercase hexadecimal confirmation tokens bypass admission', async () => {
    // Break caught: confirmation accepted hex case-insensitively while the
    // limiter skipped every uppercase token.
    const app = buildApp();
    const { request } = await loopback.open({ app });
    const source = '203.0.113.203';
    for (let i = 0; i < REACTIVATION_ADDRESS_MAX; i++) {
      const response = await request.get(`/api/user/reactivate?token=${'A'.repeat(63)}${(i % 16).toString(16).toUpperCase()}`).set('X-Forwarded-For', source);
      expect(response.status).toBe(503);
    }
    const overflow = await request.get(`/api/user/reactivate?token=${'B'.repeat(64)}`).set('X-Forwarded-For', source);
    expect(overflow.status).toBe(429);
  });
});

describe('reactivationRateLimitSkip', () => {
  it('skips when email is missing or blank', () => {
    expect(reactivationRateLimitSkip({ body: {} } as any)).toBe(true);
    expect(reactivationRateLimitSkip({ body: { email: '   ' } } as any)).toBe(true);
  });
  it('does not skip when an email is present', () => {
    expect(reactivationRateLimitSkip({ body: { email: 'a@b.com' } } as any)).toBe(false);
  });
});

describe('isValidReactivationEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidReactivationEmail('user@example.com')).toBe(true);
  });
  it('rejects blank, malformed, and oversized addresses', () => {
    expect(isValidReactivationEmail('')).toBe(false);
    expect(isValidReactivationEmail('notanemail')).toBe(false);
    expect(isValidReactivationEmail('no@dotdomain')).toBe(false);
    expect(isValidReactivationEmail('a'.repeat(250) + '@x.com')).toBe(false); // > 254 chars
  });
});

describe('reactivation limiter spray hardening', () => {
  it('returns 400 (never 429) for a malformed email no matter how often it is sent', async () => {
    const app = buildApp();
    const { request } = await loopback.open({ app });
    let last = 0;
    for (let i = 1; i <= 10; i++) {
      const res = await request.post(REQ).send({ email: 'notanemail' });
      last = res.status;
    }
    expect(last).toBe(400);
  });

  it('returns 400 for an oversized email and does not rate-limit it', async () => {
    const app = buildApp();
    const { request } = await loopback.open({ app });
    const oversized = 'a'.repeat(250) + '@example.com'; // > 254 chars
    let last = 0;
    for (let i = 1; i <= 7; i++) {
      const res = await request.post(REQ).send({ email: oversized });
      last = res.status;
    }
    expect(last).toBe(400);
  });

  it('malformed-email spray does not consume the global budget', async () => {
    const app = buildApp();
    const { request } = await loopback.open({ app });
    for (let i = 0; i < REACTIVATION_GLOBAL_MAX; i++) {
      await request.post(REQ).send({ email: 'notanemail' });
    }
    const valid = await request.post(REQ).send({ email: 'still-works@example.com' });
    expect(valid.status).toBe(200);
  });

  it('caps total valid reactivation volume via the global backstop', async () => {
    const app = buildApp();
    const { request } = await loopback.open({ app });
    for (let i = 0; i < REACTIVATION_GLOBAL_MAX; i++) {
      const res = await request.post(REQ).set('X-Forwarded-For', `192.0.${Math.floor(i / 250)}.${(i % 250) + 1}`).send({ email: `spray-${i}@example.com` });
      expect(res.status).toBe(200);
    }
    const overflow = await request.post(REQ).set('X-Forwarded-For', '198.18.0.1').send({ email: 'one-too-many@example.com' });
    expect(overflow.status).toBe(429);
    expect(overflow.body.message).toMatch(/temporarily busy/i);
  });
});
