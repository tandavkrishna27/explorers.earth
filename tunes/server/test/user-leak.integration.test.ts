/**
 * CRITICAL credential-leak regression tests (Task 1.2).
 *
 * REQUIRES A REACHABLE POSTGRES. This suite imports createApp() → storage → db,
 * which connects on import. Run it where a test DB is available, e.g.:
 *   DATABASE_URL_TEST=postgresql://tunes:tunes@127.0.0.1:5433/tunes_e2e npm test
 * Do NOT point it at the shared hosted dev DB — it seeds + deletes a user.
 *
 * It is intentionally separate from the pure-unit sanitize-user.test.ts (which
 * needs no DB). CI/local without Postgres should run only the unit suite.
 */
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createValidatedApp as createApp } from '../config/music-startup';
import { prepareProtectedRuntimeTestAuthority, releaseProtectedRuntimeTestAuthority } from './protected-runtime-test-authority';

let storage: typeof import('../storage')['storage'];

const SECRETS = ['password', 'otp', 'otpExpiry', 'emailVerificationToken', 'emailVerificationExpiry'] as const;

const SEED = {
  username: 'e2e_leak_test_user',
  password: 'scrypt$seeded-test-hash.salt',
  email: 'leak-test@example.com',
  otp: '999999',
  venueName: 'Leak test venue',
  strapiUserDocumentId: 'fixture-person-leak-test',
  strapiAccountDocumentId: 'fixture-account-leak-test',
  lifecycleOperationId: 'fixture-lifecycle-leak-test',
  guestCapabilityHash: createHash('sha256').update('fixture-guest-capability-leak-test').digest('hex'),
};

let app: Awaited<ReturnType<typeof createApp>>['app'];
let seededGuestUrl = '';
let seededUserId = 0;

beforeAll(async () => {
  const startupDependencies = await prepareProtectedRuntimeTestAuthority();
  ({ app } = await createApp(process.env, startupDependencies));
  ({ storage } = await import('../storage'));
  // createUser assigns a random-hex guestUrl (see storage.createUser). Adjust the
  // seed fields here if the users table gains NOT NULL columns.
  const created = await storage.createUser(SEED as any);
  seededUserId = created.id;
  seededGuestUrl = created.guestUrl;
  // Set the secret fields createUser may not populate, so we can prove they're stripped.
  await storage.updateUser(created.id, {
    otp: SEED.otp,
    emailVerificationToken: 'verif-seed-token',
    guestDiscoverable: true,
  } as any);
});

afterAll(async () => {
  // best-effort cleanup; storage may not expose deleteUser — ignore if absent.
  try {
    if (seededUserId) await (storage as any).deleteUser?.(seededUserId);
  } catch {
    /* leave the test row; it's namespaced (e2e_leak_test_user) */
  }
  await releaseProtectedRuntimeTestAuthority();
});

describe('CRITICAL: user-returning responses strip secrets', () => {
  it('GET /api/auth/user-data → no secret fields', async () => {
    const r = await request(app).get(`/api/auth/user-data?username=${SEED.username}`);
    expect(r.status).toBe(410);
    for (const value of [SEED.password, SEED.otp, 'verif-seed-token']) expect(JSON.stringify(r.body)).not.toContain(value);
  });

  it('GET /api/auth/onboarding-status → no secret fields', async () => {
    const r = await request(app).get(`/api/auth/onboarding-status?username=${SEED.username}`);
    expect(r.status).toBe(410);
    for (const value of [SEED.password, SEED.otp, 'verif-seed-token']) expect(JSON.stringify(r.body)).not.toContain(value);
  });

  it('POST /api/auth/sync → no secret fields (SSO bootstrap, ungated)', async () => {
    const r = await request(app)
      .post('/api/auth/sync')
      .send({ strapiUser: { username: SEED.username, email: SEED.email } });
    expect(r.status).toBe(410);
    for (const value of [SEED.password, SEED.otp, 'verif-seed-token']) expect(JSON.stringify(r.body)).not.toContain(value);
  });

  it('GET /api/playlist/:guestUrl → publicUser projection (no secrets, no email/isAdmin)', async () => {
    const r = await request(app).get(`/api/playlist/${seededGuestUrl}`);
    expect(r.status).toBe(200);
    expect(r.body.user).toBeTruthy();
    for (const k of SECRETS) expect(r.body.user[k]).toBeUndefined();
    expect(r.body.user.email).toBeUndefined();   // tighter public projection
    expect(r.body.user.isAdmin).toBeUndefined();
    expect(r.body.user.guestUrl).toBe(seededGuestUrl); // but venue-facing fields stay
  });

  // COVERAGE NOTES (Codex P2 #2):
  //  - Covered here (unauthenticated, no session needed): user-data,
  //    onboarding-status, sync, and the public playlist projection.
  //  - FOLLOW-UP (need a logged-in supertest agent / session cookie): login,
  //    register, /check, PATCH /api/user, and the admin getAllUsers lists.
  //    Add a `beforeAll` that POSTs /api/login to get a cookie, then assert
  //    those responses also strip secrets. Deferred to avoid session-setup here.
  //  - auth + identity-match assertions (401/403) land with Task 1.3+1.4.
});
