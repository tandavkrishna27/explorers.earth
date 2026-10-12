import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';
import react from '@vitejs/plugin-react';

// Default config = UNIT tests only (DB-free, the reliable `npm test` gate).
// Integration tests (*.integration.test.ts) need Postgres and run via
// `npm run test:integration` against vitest.integration.config.ts.
export default defineConfig({
  // Unit tests must not load checkout credentials from environment files.
  envDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
      // Mirror tsconfig paths: "@shared/*" -> "./shared/*"
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./server/test/setup.ts'],
    // Exclude integration tests from the default run so `npm test` never needs a DB.
    // `.music-cli-contract-isolated-*` is an ignored scratch tree (.gitignore:193) with zero
    // tracked files, frozen at migration 0052 and referenced by no tracked code. Collecting it
    // added failures to every sweep and corrupted failure accounting. The glob is deliberately
    // pinned to that one prefix: a broader exclude could hide real tests, which would be worse.
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts', '**/account-recovery.test.ts', '**/*.real-tool.test.ts', '**/.music-cli-contract-isolated-*/**'],
  },
});
