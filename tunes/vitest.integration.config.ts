import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';

// Integration config = ONLY *.integration.test.ts. These import the app and
// connect to Postgres, so run them with a reachable test DB:
//   DATABASE_URL_TEST=postgresql://tunes:tunes@127.0.0.1:5433/tunes_e2e npm run test:integration
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    env: { MUSIC_INTEGRATION_SETUP: '1' },
    environment: 'node',
    globals: true,
    globalSetup: ['./server/test/integration-global-setup.ts'],
    setupFiles: ['./server/test/setup.ts'],
    hookTimeout: 30_000,
    // Real PostgreSQL suites create, migrate, fingerprint, and drop multiple
    // isolated databases. The unit-test 5s default is too short on shared CI.
    testTimeout: 30_000,
    // Integration files share one disposable PostgreSQL authority and perform
    // schema/database teardown. Keep file order deterministic; concurrency is
    // exercised explicitly inside the projection/migration suites.
    fileParallelism: false,
    include: ['**/*.integration.test.ts', '**/account-recovery.test.ts'],
    exclude: [...configDefaults.exclude, '**/.music-cli-contract-isolated-*/**'],
  },
});
