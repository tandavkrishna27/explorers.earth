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
    // These three are named *.integration.test.ts but are INERT BY DESIGN: each declares
    // "Inert on import/collection. Only the root's reviewed guarded wrapper supplies a live
    // harness" and exports case ids plus a harness factory, registering no tests of its own.
    // Collected directly, vitest fails the file with "No test suite found". Their cases DO
    // run, through the wrappers that import them:
    //   explorers-app-enrichment-local-qualification -> contracts/app-enrichment-scheduled-run.test.ts
    //   taxonomy-real-catalog                        -> contracts/taxonomy-real-producer.test.ts
    //   migrations/app-enrichment-retention          -> contracts/app-enrichment-worker-custody.test.ts
    // so excluding them from collection removes no coverage. Each path is named exactly, for
    // the reason the unit config's own comment gives: a broader exclude could hide real tests.
    exclude: [...configDefaults.exclude, '**/.music-cli-contract-isolated-*/**',
      '**/server/test/explorers-app-enrichment-local-qualification.integration.test.ts',
      '**/server/test/taxonomy-real-catalog.integration.test.ts',
      '**/server/test/migrations/app-enrichment-retention.integration.test.ts'],
  },
});
