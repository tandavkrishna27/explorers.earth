/**
 * Integration: /api/auth/sync create path (the Google-login first-time sync).
 * REQUIRES Postgres. Run: DATABASE_URL_TEST=... npm run test:integration
 * Seeds + deletes a throwaway user; never point at a shared DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createValidatedApp as createApp } from '../config/music-startup';
import { prepareProtectedRuntimeTestAuthority, releaseProtectedRuntimeTestAuthority } from './protected-runtime-test-authority';

let storage: typeof import('../storage')['storage'];

const FRESH = { username: 'e2e_gsync_user', email: 'gsync-test@example.com' };

let app: Awaited<ReturnType<typeof createApp>>['app'];

async function removeFresh() {
  const u = await storage.getUserByUsername(FRESH.username);
  if (u) await storage.deleteUser(u.id);
}

describe('POST /api/auth/sync — first-time Google user creation', () => {
  // beforeAll cleanup guarantees the CREATE path runs even if a prior run
  // failed mid-test and left a stale row (which would otherwise make this
  // pass via the existing-user path — a false green).
  beforeAll(async () => {
    const startupDependencies = await prepareProtectedRuntimeTestAuthority();
    ({ app } = await createApp(process.env, startupDependencies));
    ({ storage } = await import('../storage'));
    await removeFresh();
  });
  afterAll(async () => {
    await removeFresh();
    await releaseProtectedRuntimeTestAuthority();
  });

  it('rejects unauthenticated username/email adoption without creating a user', async () => {
    const r = await request(app)
      .post('/api/auth/sync')
      .send({ strapiUser: { username: FRESH.username, email: FRESH.email } });

    expect(r.status).toBe(410);
    expect(r.body.error?.code).toBe('SURFACE_REMOVED');
    const persisted = await storage.getUserByUsername(FRESH.username);
    expect(persisted).toBeUndefined();
  });
});
